The project provides various tools for integrating and interacting with Swagger.  This project is in its infancy but
what is within the repository should be fully tested and reusable.  Please visit the [issue tracker][project-issues] to
see what issues we are aware of and what features/enhancements we are working on.

## Project Badges

* Build status: [![Build Status](https://travis-ci.org/apigee-127/swagger-tools.svg)](https://travis-ci.org/apigee-127/swagger-tools)
* Dependencies: [![Dependencies](https://david-dm.org/apigee-127/swagger-tools.svg)](https://david-dm.org/apigee-127/swagger-tools)
* Developer dependencies: [![Dev Dependencies](https://david-dm.org/apigee-127/swagger-tools/dev-status.svg)](https://david-dm.org/apigee-127/swagger-tools#info=devDependencies&view=table)
* Downloads: [![NPM Downloads Per Month](http://img.shields.io/npm/dm/swagger-tools.svg)](https://www.npmjs.org/package/swagger-tools)
* License: [![License](http://img.shields.io/npm/l/swagger-tools.svg)](https://github.com/apigee-127/swagger-tools/blob/master/LICENSE)
* Version: [![NPM Version](http://img.shields.io/npm/v/swagger-tools.svg)](https://www.npmjs.org/package/swagger-tools)

## Supported Swagger Versions

* [1.2][swagger-docs-v1_2]
* [2.0 (WIP)][swagger-docs-v2_0]

## Features

* Schema validation: For the file(s) supported by the Swagger specification, ensure they pass structural validation
based on the [JSON Schema][json-schema] associated with that version of the specification
* Semantic validation: Validates Swagger files above and beyond the structure of the file
* Connect middleware for adding pertinent Swagger information to your requests (swagger-metadata)
* Connect middleware for wiring request handlers to requests based on Swagger documentation (swagger-router)
* Connect middleware for using Swagger resource documents for pre-route validation (swagger-validator)
    * Validate the request Content-Type based on the operation's `consumes` value(s)
    * Validate the request parameter types
    * Validate the request parameter values (Models are not validated right now, see
      [Issue 18](https://github.com/apigee-127/swagger-tools/issues/18))

## Installation

swagger-tools is distributed via [NPM][npm] so installation is the usual: `npm install swagger-tools --save`

## Usage

The swagger-tools module currently exposes one property: `v1_2`.  This is a reference to an object that has the
following structure:

* `docsUrl`: This is a link to the Swagger documentation for the corresponding specification version
* `schemasUrl`: This is a link to the Swagger JSON Schema files for the corresponding specification version
* `version`: This is the Swagger specification version
* `schemas`: This is an object where the keys are the Swagger JSON Schema file names and the object is the loaded schema
contents
* `validate`: This is a function used to validate your Swagger document(s) based on the schema(s) for that
specifications schemas and semantically
* `composeModel`: This takes a Swagger document and generates a JSON Schema representation of the model completely
composed

Here is an example showing how to use both versions of the `validate` function *(For more details, the sources are
documented)*:

**Swagger 1.2 (v1) Example**

```javascript
var swagger = require('swagger-tools');

var spec = swagger.specs.v1_2; // Could also use 'swagger.specs.v1'
var petJson = require('./samples/1.2/pet.json');
var rlJson = require('./samples/1.2/resource-listing.json');
var results = spec.validate(rlJson, [petJson]);
```

**Swagger 2.0 (v2) Example**

```javascript
var swagger = require('swagger-tools');

var spec = swagger.specs.v2_0; // Could also use 'swagger.specs.v2'
var petStoreJson = require('./samples/2.0/petstore.json');
var results = spec.validate(petStoreJson);
```

Here is an example of using the Swagger middleware for validating requests based on your Swagger resource documents:

**Swagger 1.2 (v1) Example**

```javascript
var swagger = require('swagger-tools');

var petJson = require('./samples/1.2/pet.json');
var resourceListing = require('./samples/1.2/resource-listing.json');
var storeJson = require('./samples/1.2/user.json');
var userJson = require('./samples/1.2/store.json');
var swaggerMetadata = swagger.middleware.v1_2.swaggerMetadata; // Could also use 'swagger.metadata.v1.swaggerMetadata'
var swaggerRouter = swagger.middleware.v1_2.swaggerRouter; // Could also use 'swagger.metadata.v1.swaggerRouter'
var swaggerValidator = swagger.middleware.v1_2.swaggerValidator; // Could also use 'swagger.metadata.v1.swaggerValidator'

var connect = require('connect');
var app = connect();

// Interpret Swagger resources and attach metadata to request - must be first in swagger-tools middleware chain
app.use(swaggerMetadata(resourceListing, [petJson, storeJson, userJson]));

// Validate Swagger requests
app.use(swaggerValidator());

// Route validated requests to appropriate controller
app.use(swaggerRouter({useStubs: true, controllers: './controllers'}));

// ...
```

**Swagger 2.0 (v2) Example**

```javascript
var swagger = require('swagger-tools');

var swaggerObject = require('./samples/2.0/petstore.json');
var swaggerMetadata = swagger.middleware.v2_0.swaggerMetadata; // Could also use 'swagger.metadata.v2.swaggerMetadata'
var swaggerRouter = swagger.middleware.v2_0.swaggerRouter; // Could also use 'swagger.metadata.v2.swaggerRouter'
var swaggerValidator = swagger.middleware.v2_0.swaggerValidator; // Could also use 'swagger.metadata.v2.swaggerValidator'

var connect = require('connect');
var app = connect();

// Interpret Swagger resources and attach metadata to request - must be first in swagger-tools middleware chain
app.use(swaggerMetadata(swaggerObject));

// Validate Swagger requests
app.use(swaggerValidator());

// Route validated requests to appropriate controller
app.use(swaggerRouter({useStubs: true, controllers: './controllers'}));

// ...
```

## Contributing

This project uses [Gulp][gulp] for building so `npm install -g gulp` once you clone this project.  Running `gulp` in the
project root will lint check the source code and run the unit tests.

[gulp]: http://gulpjs.com/
[json-schema]: http://json-schema.org/
[npm]: https://www.npmjs.org/
[project-issues]: https://github.com/apigee/swagger-tools/issues
[swagger]: https://helloreverb.com/developers/swagger
[swagger-docs-v1_2]: https://github.com/wordnik/swagger-spec/blob/master/versions/1.2.md
[swagger-docs-v2_0]: https://github.com/reverb/swagger-spec/blob/master/versions/2.0.md
