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
const testAPI = new r.ExternalAPI({
  location: 'http://localhost:3000'
});
```

We may then declare any number of `resources` which represent various resources we may request, create, or modify the various entities on the server. A `resource` in this context typically has a one-to-one mapping to a specific endpoint, though this is not necessarily enforced or required.

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

This explains the basic usage and functionality, though does not adequately demonstrate why this approach is beneficial. For how this looks within an actual React application, check out some of the [examples](examplesgohere.com).
