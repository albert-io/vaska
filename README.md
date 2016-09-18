# Vaska

Vaska is a light-weight API data cache layer that can run in both the client and the server. It's primary intent is to introduce a clean separation between the data model and the view model, creating a single and immutable source of truth for all model data in the client, while providing a boost to productivity when expanding your application to consume new endpoints or refactoring existing ones. It fits most neatly within [Flux applications](https://facebook.github.io/flux/) (and their derivatives), though it can provide benefits even outside of that context.

## Motivation

Our main platform at [albert.io](https://www.albert.io) is a single page application implemented within the [Flux architecture](https://facebook.github.io/flux/) utilizing an opinionated, immutable, state container managing a single state tree. Our backend is a RESTful API supplying all the data available to the application. We started out keeping all of the data we would receive from the API directly in this state tree alongside the same data backing the views and soon found this to be a mess of asynchronous calls, juggling of model data, and general confusion about the operations required in order to completely render a view. This library is our attempt at resolving the issues we've encountered. It provides:

1. Non-blocking, synchronous interaction with API data
2. Separation of concerns between data driving the view logic and API data
3. A smart, customizable cache that manages all the work involved in retrieving and keeping your API resources up to date
4. A simple interface intent on minimizing the effort required to add or refactor existing API endpoints your application is consuming

## Usage

Please check out our [guide](linkgoeshere.com) for some sample use cases!
