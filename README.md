The project provides various tools for integrating and interacting with Swagger.  This project is in its infancy but
what is within the repository should be fully tested and reusable.  Please visit the [issue tracker][project-issues] to
see what issues we are aware of and what features/enhancements we are working on.

## Project Version

* GitHub Release: [![GitHub Release](http://img.shields.io/github/release/apigee-127/swagger-tools.svg)](https://github.com/apigee-127/swagger-tools/releases)
* NPM Version: [![NPM Version](http://img.shields.io/npm/dm/swagger-tools.svg)](https://www.npmjs.org/package/swagger-tools)

## Project Badges

* Build status: [![Build Status](https://img.shields.io/travis/apigee-127/swagger-tools.svg)](https://travis-ci.org/apigee-127/swagger-tools)
* Dependencies: [![Dependencies](http://img.shields.io/david/apigee-127/swagger-tools.svg)](https://david-dm.org/apigee-127/swagger-tools)
* Developer dependencies: [![Dev Dependencies](http://img.shields.io/david/dev/apigee-127/swagger-tools.svg)](https://david-dm.org/apigee-127/swagger-tools#info=devDependencies&view=table)

## Supported Swagger Versions

* [1.2][swagger-docs-v1_2]

## Features

* Schema validation: For the file(s) supported by the Swagger specification, ensure they pass structural validation
based on the [JSON Schema][json-schema] associated with that version of the specification
* Semantic validation: Validates Swagger files individually and as a whole (resource listing combined with API
declarations) _(See [Issue #1](https://github.com/apigee-127/swagger-tools/issues/1) for more details)_
* Connect middleware for adding pertinent Swagger information to your requests (swagger-metadata)
* Connect middleware for wiring request handlers to requests based on Swagger documentation (swagger-router)
* Connect middleware for using Swagger resource documents for pre-route validation (swagger-validator)
    * Validate the request Content-Type based on the operation's `consumes` value(s)
    * Validate the request parameter types
    * Validate the request parameter values

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
* `validate`: This is a function used to validate a Swagger document, as a JavaScript object, against a Swagger schema
file
* `validateApi`: This is a function used to validate a "full API" of Swagger documents including a resource listing and
an array of API declarations

Here is an example showing how to use both versions of the `validate` function *(For more details, the sources are
documented)*:

```javascript
var spec = require('swagger-tools').v1_2;
var petJson = require('./samples/1.2/pet.json');
var rlJson = require('./samples/1.2/resource-listing.json');
var petResults = spec.validate(petJson); // The default schema used is 'apiDeclaration.json'
var rlResults = spec.validate(rlJson, 'resourceListing.json');
var apiResults = spec.validateApi(rlJson, [petJson]);
```

Here is an example of using the Swagger middleware for validating requests based on your Swagger resource documents:

```javascript
var connect = require('connect');
var petJson = require('./samples/1.2/pet.json');
var resourceListing = require('./samples/1.2/resource-listing.json');
var storeJson = require('./samples/1.2/user.json');
var userJson = require('./samples/1.2/store.json');
var swaggerMetadata = require('swagger-tools/middleware/swagger-metadata');
var swaggerRouter = require('swagger-tools/middleware/swagger-router');
var swaggerValidator = require('swagger-tools/middleware/swagger-validator');
var app = connect();

// More coming on this shortly
app.use(swaggerMetadata(resourceListing, [petJson, storeJson, userJson]));
app.use(swaggerRouter({useStubs: true, controllers: './controllers'}));
app.use(swaggerValidator());

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
