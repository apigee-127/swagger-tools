The purpose of Swagger Tools (swagger-tools) is to provide some useful [Swagger][swagger] tooling written for Node.js
and the browser (where applicable).  Use the links below to get specific documentation about the provided APIs and
tools:

* [API][swagger-tools-api]: The JavaScript API for interacting with Swagger documents
* [CLI][swagger-tools-cli]: The command line interface for swagger-tools
* [Middleware][swagger-tools-middleware]: Connect middleware using Swagger information for various things
(Ex: Request validation, routing, ...)
* [Validation][swagger-tools-swagger-validation]: Documentation on how our Swagger validation works

## Installation

Swagger Tools is available for both Node.js and the browser.  Installation instructions for each environment are below.

### Browser

Installation for browser applications can be done via [Bower][bower] or by downloading a standalone binary.

#### Using Bower

```
bower install swagger-tools --save
```

#### Standalone Binaries

The standalone binaries come in two flavors:

* [swagger-tools-standalone.js](https://raw.github.com/apigee-127/swagger-tools/master/browser/swagger-tools-standalone.js): _1,536kb_, full source _(including all dependencies)_ and source maps
* [swagger-tools-standalone-min.js](https://raw.github.com/apigee-127/swagger-tools/master/browser/swagger-tools-standalone-min.js): _204kb_, minified, compressed
and no sourcemap

### Node.js

Installation for Node.js applications can be done via [NPM][npm].

```
npm install swagger-tools --save
```

If you want to use the `swagger-tools` executable for validating Swagger documents, you can install swagger-tools
globally using the following:

```
npm install -g swagger-tools
```

At this point, you're ready for the [Quick Start][quick-start].

[bower]: http://bower.io/
[npm]: npmjs.org
[quick-start]: https://github.com/apigee-127/swagger-tools/blob/master/docs/QuickStart.md
[swagger]: http://swagger.io/
[swagger-tools-api]: https://github.com/apigee-127/swagger-tools/blob/master/docs/API.md
[swagger-tools-cli]: https://github.com/apigee-127/swagger-tools/blob/master/docs/CLI.md
[swagger-tools-middleware]: https://github.com/apigee-127/swagger-tools/blob/master/docs/Middleware.md
[swagger-tools-swagger-validation]: https://github.com/apigee-127/swagger-tools/blob/master/docs/Swagger_Validation.md
