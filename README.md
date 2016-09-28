# Vaska

Vaska is a light-weight API data cache layer that can run in both the client and the server. It's primary intent is to introduce a clean separation between the data model and the view model, creating a single and immutable source of truth for all model data in the client, while providing a boost to productivity when expanding your application to consume new endpoints or refactoring existing ones. It fits most neatly within [Flux applications](https://facebook.github.io/flux/) (and their derivatives), though it can provide benefits even outside of that context.

## Motivation

Our main platform at [albert.io](https://www.albert.io) is a single page application implemented within the [Flux architecture](https://facebook.github.io/flux/) utilizing an opinionated, immutable, state container managing a single state tree. Our backend is a RESTful API supplying all the data available to the application. We started out keeping all of the data we would receive from the API directly in this state tree alongside the same data backing the views and soon found this to be a mess of asynchronous calls, juggling of model data, and general confusion about the operations required in order to completely render a view. This library is our attempt at resolving the issues we've encountered. It provides:

1. Non-blocking, synchronous interaction with API data
2. Separation of concerns between data driving the view logic and API data
3. A smart, customizable cache that manages all the work involved in retrieving and keeping your API resources up to date
4. A simple interface intent on minimizing the effort required to add or refactor existing API endpoints your application is consuming

## Usage

### Simple case:

To begin, we need only the `ExternalAPI` class from the library. This class represents a single REST API with which your application will communicate.

```
const testAPI = new vaska.ExternalAPI({
  location: 'http://localhost:3000'
});
```

We may then declare any number of `resources` which represent various entities we may request, create, or modify on the server. A `resource` in this context typically has a one-to-one mapping to a specific endpoint, though this is not necessarily enforced or required.

```
const userResource = {
  id: 'USER',
  endpoint: '/users/:username',
  model: new Map({
      username: '',
      status: '',
      task: ''
  })
};
```

We then register this resource with the API by invoking `addResource()` on the API.

```
testAPI.addResource(userResource);
```

From here, we declare functions which will work with the resource and serve as the interface to the model itself.

```
function getUser(username) {
  return testAPI.queryResource({
    id: userResource.id,
    params: {
      username
    }
  });
}
```

Any call to `queryResource()` is guaranteed to return an object of type `Payload`. If this resource was never queried before in the application, a request will be queued up and will be inserted into the cache once it resolves and the returned payload will have the empty model we specified in our resource definition above. This allows us to maintain a purely declarative component. Repeat calls to this same query resource will not result in a new request. A payload is always guaranteed to have three attributes that we care about:

1. `data` - Either the most recent response we saw from the server for this request or the empty model specified in the resource definition
2. `promise` - A promise which resolves with either the most recent, non-stale data we received from this endpoint.
3. A status. You can ask this payload if it has data that came from the server with `hasServerData()`, if it `isPending()` any response from the server, or if this request returned any non 2xx status code (or otherwise threw any exceptions) with `isValid()`.

The first time we call `getUser('goldendase').data`, we will get the empty model we registered with this resource above and a request is queued up in the background. We can continue calling `getUser('goldendase').data` over and over and be certain that no new requests will be queued up. Once the request to the server successfully completes, the response is cached and the next time we call `getUser('goldendase').data` we receive the user object returned by the server. Subsequent calls will continue to return this user object until it expires in the cache, either after the default 60 seconds, or whatever time-to-live we've set for this resource. Once the resource expires, a new request will be made the next time we call `getUser('goldendase').data`, though this call will continue to return the stale version of the resource until it is refreshed.

You will still need to hook the cache into the React lifecycle. This can be accomplished by listening for the `change` event and `forceUpdate`ing your top-level component, though whatever framework you're using may provide you with a different way to force a re-render.

For how this looks within an actual React application, check out the [example](https://github.com/albert-io/vaska-example).

## Documentation

Vaska exposes only a single class that you will ever need to instantiate.

### ExternalAPI

This class takes in a single JSON object which represents the configuration of the API this object will represent. This is the only thing you will ever directly interact with in this library. You can find a sample usage above. The `ExternalAPI` is also an event emitter that emits the `change` event anytime anything changes in the cache or the configuration of the API. The possible configuration options are:

* id - _string_ - A unique string identifier that represents this API
* location - _string_ - The root address of this API server (e.g. `http://localhost:3000`)
* timeout - _integer_ - The default time to live for any cache data, in _ms_. Default: 60000
* cacheClearoutInterval - _integer_ - Optional interval to completely purge the cache of any item the cache interns `cacheClearoutInterval` ms after retrieval. Absence of this option will result in the resources never being completely purged (stale data will live in the cache for the full duration of the process)
* initialCache - _Immutable Map_ - Optional initial state of the cache. Useful for re-hydrating the cache in the browser.

The available methods are:

* addResource(resource) - Takes in a plain JSON object that describes a resource this API will track. See below for resource configuration options. This will register the resource with the cache such that you can `queryResource` it later. Returns nothing.
* removeResource(id) - De-registers the resource with this ID from the cache, deleting its cache and making it no longer query-able. Returns nothing.
* queryResource(queryObject) - Takes in a plain JSON object that describes the kind of query you want to make against the resource. Returns a `Payload`.
* isAuthenticated() - Returns `true` if the current API is aware of authentication information you want it to use when querying the API
* setAuthHeader(header) - Takes in a plain JSON object which represents the header to be attached to all requests against this API. Causes a `change` event to fire.
* unsetAuthHeader() - Removes the authHeader set above and clears out the entire cache. Emits `change` event.

### Resource

A resource is a plain JSON object that describes an endpoint and any interactions you can make with it. A resource configuration has these fields available to you:

* endpointTemplate - _string_ - Required. The template for the path at which this resource lives. You may specify path parameters by using the `:` notation. E.g. `/users/:username` indicates that this endpoint will expect a username when queried against.
* timeUntilStale - _integer_ - Optional. The time to live of this resource, in ms. If not specified, it will use the time to live specified on the ExternalAPI this resource belongs to.
* model - _Immutable object_ - Optional. A representation of what the data you expect to get from this endpoint looks like. This is also the object you will get back if you query the API for a resource it does not yet have.
* modelInterface - _Class_ - Optional. An optional class which will be attached to every `Payload` returned from querying this resource. The `Payload`'s data will be passed into the constructor of this class and you may access any methods or properties of this class from the payload via the `interface` attribute on the payload.
* authRequired - _boolean_ - Optional. Boolean that indicates whether auth is necessary when querying this resource. If set to `true` and the user is not authenticated (via the `setAuthHeader` method on the `ExternalAPI`), the request will not be made on `queryResource`, saving a failed trip to the server.

### Payload

A wrapper for a piece of data from the cache. Every `queryResource` call will return one of these. It is guaranteed to have the following methods:

* data - Getter that gives you the data that the cache has received from the server for this query, or the empty model if it does not yet have data.
* promise - Getter that gives you a promise representing any pending query against the server. This is always available, even if there is not one currently pending (in that case it is a promise that immediately resolves with `data` from above)
* error - Getter that gives you the error that the server received the last time this query completed against this resource.
* hasServerData() - Returns `true` if this payload represents data from the server (whether stale or not).
* isPending() - Returns `true` if there is currently a query pending against the server for data.
* isEmpty() - Returns `true` if the Payload is empty and its data is the empty model specified on configuration of this resource.
* isFresh() - Returns `true` if the Payload is fresh (has data from the server, and that data has not yet passed its time to live).
* isStale() - Returns `true` if the Payload is stale (has data from the server, but that data has passed its time to live).
* isValid() - Returns `true` if the Payload contains a result that completed successfully against the server.


### Querying a Resource

A resource may be queried via the `queryResource` method described above. The queryResource method takes in a JSON query config object which may have the following attributes specified:

* id - _string_ - Required. This should match the ID of the `resource` you want to query that you have already added to the API.
* query - _object_ - Optional. An object containing query parameter name -> value mappings. E.g. `query: { foo: 'bar' }` will result in the query being made with `?foo=bar`.
* params - _object_ - Optional. An object containing any path parameters you want to substitute in the endpoint template. The keys must match the names specified in the template (see `endpointTemplate` under `Resource`)
* header - _object_ - Optional. Custom header to be merged with any authentication header you may have specified with the API already.
* method - _string_ - Optional. One of `'get'`, `'post'`, `'put'`, `'delete'`. The HTTP method to use when querying this resource. Defaults to `'get'`.
* payload - _object_ - Optional. The payload to send in the body of the request.
* forceRefresh - _boolean_ - Optional. Notifies the cache to mark all of its data as stale upon successful completion of this query.
* customHookData - _object_ - Optional. Custom object to be passed along with the `change` event upon completion of this request.
