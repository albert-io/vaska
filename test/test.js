const should = require('chai').should();
const {Map} = require('immutable');
const server = require('./server');
const vaska = require ('../resource');
const {
  DEFAULT_CACHE_TTL,
  DEFAULT_REQUEST_TIMEOUT
} = require('../constants');

let serverHandle = null;
let testAPI = null;

const userResource = {
  id: 'USER',
  endpoint: '/users/:username',
  model: new Map(),
};

describe('cache functionality', () => {
  before(() => {
    serverHandle = server.listen(3000, () => {})
    testAPI = new vaska.ExternalAPI({location: 'http://localhost:3000'});
  });

  describe('API defintion', () => {
    it('should have sensible defaults', () => {

    });
  });

  describe('resource creation', () => {
    beforeEach(() => {
      testAPI.addResource(userResource);
    });

    it('should be capable of creating a resource', () => {
      testAPI.resourcePool.has('USER').should.equal(true);
      testAPI.resourcePool.get('USER').endpointTemplate.should.equal(userResource.endpoint);
    });

    it('should have sensible defaults', () => {
      const resource = testAPI.resourcePool.get('USER');

      resource.timeUntilStale.should.equal(DEFAULT_CACHE_TTL);
      resource.authRequired.should.equal(false);
      should.not.exist(resource.modelInterface)
      resource.cache.size.should.equal(0);
      resource.parentApi.should.equal(testAPI);
    });

    afterEach(() => {
      testAPI.removeResource('USER');
    })
  });

  after(() => {
    serverHandle.close();
    testAPI = null;
  });
});
