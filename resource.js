'use strict';

const _ = require('lodash');
const request = require('superagent');
const {
  fromJS,
  Map,
  Set
} = require('immutable');
const {
  DataStatus,
  DEFAULT_CACHE_TTL,
  DEFAULT_REQUEST_TIMEOUT
} = require('./constants');
const {
  isServer,
  isBrowser,
  isStatusSuccess,
  isInvalidRequest,
  normalizeError,
  keyBuilder
} = require('./util');

function getEmptyPayload(model) {
  return new Payload({
    status: DataStatus.EMPTY,
    promise: Promise.resolve(model),
    data: model
  });
}

class Payload {
  constructor({
      /* eslint-disable no-unused-vars */
    status = DataStatus.EMPTY,
    data,
    promise = Promise.resolve(new Map()),
    parentApi,
    error
    /* eslint-enable no-unused-vars */
  }) {
    this._data = data;
    this._promise = promise;
    this._error = error;

    this.status = status;
    this.parentApi = parentApi;
    this.affectedResources = new Set();
    this.invalidatedResources = new Set();
  }

  hasServerData() {
    return this.isFresh() || this.isStale();
  }

  isPending() {
    return this.isStale() || this.isEmpty();
  }

  isEmpty() {
    return this.status === DataStatus.EMPTY;
  }

  isFresh() {
    return this.status === DataStatus.FRESH;
  }

  isStale() {
    return this.status === DataStatus.STALE;
  }

  isValid() {
    return this.status !== DataStatus.ERROR;
  }

  get data() {
    return this._data;
  }

  get error() {
    return this._error;
  }

  get promise() {
    return this._promise;
  }

  affectsResource(resourceObject) {
    if (this.affectedResources.isEmpty()) {
      this.promise.then(() => {
        this.affectedResources.forEach((resource) => {
          const key = keyBuilder(resource);
          this.parentApi.resourcePool
            .get(resource.id)
            .invalidateCacheKey(key);
        });
      }).catch((error) => {
        console.error('Could not update affected resource due to error: ', error); //eslint-disable-line no-console
      });
    }

    this.affectedResources = this.affectedResources.add(resourceObject);

    return this;
  }

  invalidatesResource(resourceId) {
    if (this.invalidatedResources.isEmpty()) {
      this.promise.then(() => {
        this.invalidatedResources.forEach((id) => {
          this.parentApi.resourcePool
            .get(id, new Map())
            .forEach((resource, key) => {
              resource.invalidateCache();
            });
        });
      });
    }

    this.invalidatedResources.add(resourceId);

    return this;
  }
}

class ExternalAPI {
  constructor({
    /* eslint-disable no-unused-vars */
    id = null,
    location,
    postResponseHook = () => {},
    timeout = DEFAULT_REQUEST_TIMEOUT,
    cacheClearoutInterval = null,
    initialCache = new Map()
    /* eslint-enable no-unused-vars */
  }) {
    this.id = id;
    this.location = location;
    this.postResponseHook = postResponseHook;
    this.timeout = timeout;
    this.initialCache = initialCache;

    this.resourcePool = new Map();
    this.authHeader = {};
  }

  addResource({
    id,
    timeUntilStale = DEFAULT_CACHE_TTL,
    endpoint,
    model,
    modelInterface,
    authRequired = false
  }) {
    if (_.isUndefined(endpoint) || _.isUndefined(model)) {
      throw new Error('Could not add resource: endpoint and model must both be specified');
    }

    const resourceKey = id;
    const resource = new Resource({
      id: id,
      endpointTemplate: endpoint,
      timeUntilStale,
      parentApi: this,
      model,
      modelInterface,
      authRequired,
      initialCache: this.initialCache.get(id, new Map())
    });
    this.resourcePool = this.resourcePool.set(resourceKey, resource);

    return id;
  }

  removeResource(id) {
    this.resourcePool = this.resourcePool.delete(id);
  }

  queryResource({
    id,
    query,
    params,
    header = {},
    method = 'get',
    payload,
    forceRefresh = false,
    customHookData
  }) {
    const resource = this.resourcePool.get(id, null);

    if (resource === null) {
      throw new Error(`Resource ${id} was never initialized.`);
    } else {
      let res = null;
      try {
        res = resource.get({
          id: id,
          params: params,
          query: query,
          header: header,
          forceRefresh: forceRefresh,
          method: method.toLowerCase(),
          payload: payload,
          auth: this.isAuthenticated(),
          customHookData
        });
      } catch (err) {
        console.error(err.stack); //eslint-disable-line no-console
      }
      return res;
    }
  }

  isAuthenticated() {
    return !_.isEmpty(this.authHeader);
  }

  setAuthHeader(authHeader) {
    this.authHeader = authHeader;
  }

  unsetAuthHeader() {
    this.authHeader = {};
  }
}


// Each resource keeps track of the params keyed and has multiple resources within itself
// and refetches if expired. Keep a fetch timestamp. Update authtoken!
// endpointTemplate: e.g. /sets/:id
class Resource {
  constructor({
    /* eslint-disable no-unused-vars */
    endpointTemplate,
    timeUntilStale,
    model,
    modelInterface,
    parentApi,
    authRequired = false,
    initialCache
    /* eslint-ensable no-unused-vars */
  }) {
    this.cache = initialCache;
    this.endpointTemplate = endpointTemplate;
    this.timeUntilStale = timeUntilStale;
    this.model = model;
    this.parentApi = parentApi;
    this.authRequired = authRequired;
    this.modelInterface = modelInterface;
  }

  invalidateCache() {
    this.cache = this.cache.map((cacheKey, value) => {
      return value.has('timestamp') ? value.set('timestamp', 0) : value;
    });
  }

  invalidateCacheKey(key) {
    if (this.cache.has(key)) {
      this.cache = this.cache.setIn([key, 'timestamp'], 0);
    }
  }

  get({
    id,
    params,
    query,
    header,
    payload,
    forceRefresh,
    auth = false,
    method = 'get',
    customHookData
  }) {
    if (!['get', 'post', 'put', 'delete'].includes(method)) {
      throw new Error(`Method must be one of 'get', 'post', 'put', 'delete'`);
    }

    if (!auth && this.authRequired) {
      console.error(`Authentication required at endpoint ${this.endpointTemplate} for resource ${id}`); //eslint-disable-line no-console
      return new Payload({
        status: DataStatus.ERROR,
        promise: new Promise.resolve(this.model),
        data: this.model
      });
    }

    const now = new Date();
    const cacheKey = keyBuilder({
      query, params, header
    });
    let path = this.endpointTemplate;

    if (isInvalidRequest(params)) {
      console.warn( //eslint-disable-line no-console
        `The specified parameters ${params} were not fully specified for resource ${id}.
        No request will be made and you will receive an empty model.`
      );

      return new Payload({
        status: DataStatus.ERROR,
        promise: new Promise.resolve(this.model),
        data: this.modelInterface ? new this.modelInterface(this.model) : this.model
      });
    }

    path = _.reduce(params, (result, value, name) => {
      return path.replace(`:${name}`, value)
    }, path);

    const apiParams = {
      path: path,
      query: query,
      header: header,
      cacheKey: cacheKey,
      payload: payload,
      customHookData
    };

    if (method === 'get') {
      if (this.cache.has(cacheKey)) {
        const data = this.cache.get(cacheKey);

        // GET is already pending
        if (data.has('pendingGet')) {
          const status = data.get('data') ? DataStatus.STALE : DataStatus.EMPTY;
          const payload = status === DataStatus.EMPTY ? this.model : data.get('data');
          return new Payload({
            status: status,
            promise: data.get('pendingGet'),
            data: this.modelInterface ? new this.modelInterface(payload) : payload
          });
        // Last GET for this resource failed and the cache is not yet expired
        } else if (!data.get('success') && (now - data.get('timestamp')) < this.timeUntilStale) {
          return new Payload({
            status: DataStatus.ERROR,
            promise: new Promise((resolve, reject) => {
              reject(data.get('data'));
            }),
            data: this.modelInterface ? new this.modelInterface(this.model) : this.model,
            error: data.get('data')
          });
        // Last GET is fresh
        } else if ((now - data.get('timestamp')) < this.timeUntilStale && !forceRefresh) {
          return new Payload({
            status: DataStatus.FRESH,
            promise: new Promise((resolve) => {
              resolve(data.get('data'));
            }),
            data: this.modelInterface ? new this.modelInterface(data.get('data')) : data.get('data')
          });
        // GET is STALE
        } else {
          return new Payload({
            status: DataStatus.STALE,
            promise: this.makeFetch(apiParams),
            data: this.modelInterface ? new this.modelInterface(data.get('data')) : data.get('data')
          });
        }
      } else {
        return new Payload({
          status: DataStatus.EMPTY,
          promise: this.makeFetch(apiParams),
          data: this.modelInterface ? new this.modelInterface(this.model) : this.model
        });
      }
    } else if (method === 'put') {
      return new Payload({
        status: DataStatus.PENDING_PUT,
        promise: this.makePut(apiParams),
        data: null,
        parentApi: this.parentApi
      });
    } else if (method === 'post') {
      return new Payload({
        status: DataStatus.PENDING_POST,
        promise: this.makePost(apiParams),
        data: null,
        parentApi: this.parentApi
      });
    } else if (method === 'delete') {
      return new Payload({
        status: DataStatus.PENDING_DELETE,
        promise: this.makeDelete(apiParams),
        data: null,
        parentApi: this.parentApi
      });
    }
  }

  makeFetch({
    path = '',
    query,
    cacheKey,
    header,
    customHookData
  }) {
    const fullPath = this.parentApi.location
      .concat(path);
    const pendingGet = new Promise((resolve, reject) => {
      request
        .get(fullPath)
        .query(query)
        .timeout(this.parentApi.timeout)
        .set(header)
        .end((err, res) => {
          const timestamp = new Date();
          const status = res.status;
          let payload = null;

          if (!err) {
            if (res.hasOwnProperty('text')) {
              try {
                payload = JSON.parse(res.text);
              } catch (error) {
                const normalizedError = normalizeError(error, status);
                if (isBrowser()) {
                  const data = new Map({
                    data: error,
                    timestamp: timestamp,
                    success: false
                  });
                  this.cache = this.cache.set(cacheKey, data);
                }
                this.parentApi.postResponseHook({error: normalizedError, customHookData});
                return reject(normalizedError);
              }
            }
          }

          if (err || !isStatusSuccess(status)) {
            const normalizedError = normalizeError(err, status);
            this.cache = this.cache.remove(cacheKey);
            if (isBrowser()) {
              const data = new Map({
                data: normalizedError,
                timestamp: timestamp,
                success: false
              });
              this.cache = this.cache.set(cacheKey, data);
            }

            this.parentApi.postResponseHook({error: normalizedError, customHookData});
            return reject(normalizedError);
          } else {
            const immutablePayload = fromJS(payload);
            const data = new Map({
              data: immutablePayload,
              timestamp: timestamp,
              success: true
            });

            this.cache = this.cache.set(cacheKey, data);
            this.parentApi.postResponseHook({payload: immutablePayload, customHookData});
            return resolve(immutablePayload);
          }
        });
    });

    const currentValue = this.cache.has(cacheKey) ?
      this.cache.get(cacheKey).get('data')
      : null;
    this.cache = this.cache.set(cacheKey, new Map({
      pendingGet: pendingGet,
      data: currentValue
    }));

    if (this.parentApi.cacheClearoutInterval) {
      setTimeout(() => {
        this.cache = this.cache.delete(cacheKey);
      }, this.parentApi.cacheClearoutInterval);
    }

    return pendingGet;
  }

  makePut({
    path = '',
    payload,
    header
  }) {
    const fullPath = this.parentApi.location
      .concat(path);

    const pendingPut = new Promise((resolve, reject) => {
      request
        .put(fullPath)
        .send(payload)
        .timeout(this.parentApi.timeout)
        .set(header)
        .end((err, res) => {
          const status = res.status;
          let payload = null;
          if (!err) {
            if (res.hasOwnProperty('text')) {
              try {
                payload = JSON.parse(res.text);
              } catch (error) {
                const normalizedError = normalizeError(error, status);
                this.parentApi.postResponseHook({error: normalizedError, customHookData});
                return reject(normalizedError);
              }
            }
          }

          if (err || isStatusSuccess(status)) {
            const normalizedError = normalizeError(err, status);
            this.parentApi.postResponseHook({error: normalizedError, customHookData});
            return reject(normalizedError);
          } else {
            const immutablePayload = fromJS(payload);
            this.parentApi.postResponseHook({payload: immutablePayload, customHookData});
            return resolve(immutablePayload);
          }
        });
    });

    return pendingPut;
  }

  makePost({
    path = '',
    payload,
    header
  }) {
    const fullPath = this.parentApi.location
      .concat(path);

    const pendingPost = new Promise((resolve, reject) => {
      request
        .post(fullPath)
        .send(payload)
        .timeout(this.parentApi.timeout)
        .set(header)
        .end((err, res) => {
          const status = res.status;
          let payload = null;
          if (!err) {
            if (res.hasOwnProperty('text') && res.text) {
              try {
                payload = JSON.parse(res.text);
              } catch (error) {
                const normalizedError = normalizeError(error, status);
                this.parentApi.postResponseHook({error: normalizedError, customHookData});
                return reject(normalizedError);
              }
            }
          }

          if (err || isStatusSuccess(status)) {
            const normalizedError = normalizeError(err, status);
            this.parentApi.postResponseHook({error: normalizedError, customHookData});
            return reject(normalizedError);
          } else {
            const immutablePayload = fromJS(payload);
            this.parentApi.postResponseHook({payload: immutablePayload, customHookData});
            return resolve(immutablePayload);
          }
        });
    });

    return pendingPost;
  }

  makeDelete({
    path = '',
    header
  }) {
    const fullPath = this.parentApi.location
      .concat(path);

    const pendingDelete = new Promise((resolve, reject) => {
      request
        .del(fullPath)
        .timeout(this.parentApi.timeout)
        .set(header)
        .end((err, res) => {
          const status = res.status;

          if (err || isStatusSuccess(status)) {
            const normalizedError = normalizeError(err, status);
            this.parentApi.postResponseHook({error: normalizedError, customHookData});
            return reject(normalizedError);
          } else {
            this.parentApi.postResponseHook({payload: new Map(), customHookData});
            return resolve(new Map());
          }
        });
    });

    return pendingDelete;
  }
}

module.exports = {
  ExternalAPI,
  getEmptyPayload
}
