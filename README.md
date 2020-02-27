The project provides various tools for integrating and interacting with Swagger.  This project is in its infancy but
what is within the repository should be fully tested and reusable.  Please visit the [issue tracker][project-issues] to
see what issues we are aware of and what features/enhancements we are working on.  Otherwise, feel free to review the
[Release Notes][release-notes] to see what is new and improved.

## Project Badges

[![Join the chat at https://gitter.im/apigee-127/swagger-tools](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/apigee-127/swagger-tools?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

* Build status: [![Build Status](https://travis-ci.org/apigee-127/swagger-tools.svg)](https://travis-ci.org/apigee-127/swagger-tools)
* Dependencies: [![Dependencies](https://david-dm.org/apigee-127/swagger-tools.svg)](https://david-dm.org/apigee-127/swagger-tools)
* Developer dependencies: [![Dev Dependencies](https://david-dm.org/apigee-127/swagger-tools/dev-status.svg)](https://david-dm.org/apigee-127/swagger-tools#info=devDependencies&view=table)
* Downloads: [![NPM Downloads Per Month](http://img.shields.io/npm/dm/swagger-tools.svg?style=flat)](https://www.npmjs.org/package/swagger-tools)
* License: [![License](http://img.shields.io/npm/l/swagger-tools.svg?style=flat)](https://github.com/apigee-127/swagger-tools/blob/master/LICENSE)
* Bower Version [![NPM Version](https://img.shields.io/bower/v/swagger-tools.svg?style=flat)](http://bower.io/search/?q=swagger-tools)
* NPM Version: [![NPM Version](http://img.shields.io/npm/v/swagger-tools.svg?style=flat)](https://www.npmjs.org/package/swagger-tools)

## Supported Swagger Versions

* [1.2][swagger-docs-v1_2]
* [2.0][swagger-docs-v2_0]

## Features

* Simple CLI
    * Validate Swagger document(s)
    * Convert Swagger 1.2 documents to Swagger 2.0
* Schema validation: For the file(s) supported by the Swagger specification, ensure they pass structural validation
based on the [JSON Schema][json-schema] associated with that version of the specification _(Browser and Node)_
* Semantic validation: Validates Swagger files above and beyond the structure of the file _(Browser and Node)_
* Connect middleware for adding pertinent Swagger information to your requests _(Node only)_
* Connect middleware for wiring up security handlers for requests based on Swagger documentation _(Node only)_
* Connect middleware for wiring request handlers to requests based on Swagger documentation _(Node only)_
* Connect middleware for serving your Swagger documents and [Swagger UI][swagger-ui] _(Node only)_
* Connect middleware for using Swagger resource documents for pre-route validation _(Node only)_
    * Validate the request/response Content-Type based on the operation's `consumes/produces` value(s)
    * Validate the request parameter types
    * Validate the request parameter values
    * Validate the response values

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

* [swagger-tools-standalone.js](https://raw.github.com/apigee-127/swagger-tools/master/browser/swagger-tools-standalone.js): _2,280kb_, full source _(including all dependencies)_ and source maps
* [swagger-tools-standalone-min.js](https://raw.github.com/apigee-127/swagger-tools/master/browser/swagger-tools-standalone-min.js): _316kb_, minified, compressed
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

## Documentation

swagger-tools is heavily documented so head on over to the project  [documentation][documentation] or jump straight to
the [Quick Start][quick-start].

## Contributing

This project uses [Gulp][gulp] for building so `npm install -g gulp` once you clone this project.  Running `gulp` in the
project root will lint check the source code and run the unit tests.

[bower]: http://bower.io/
[documentation]: https://github.com/apigee-127/swagger-tools/blob/master/docs/README.md
[gulp]: http://gulpjs.com/
[json-schema]: http://json-schema.org/
[npm]: https://www.npmjs.org/
[project-issues]: https://github.com/apigee/swagger-tools/issues
[quick-start]: https://github.com/apigee-127/swagger-tools/blob/master/docs/QuickStart.md
[release-notes]: https://github.com/apigee-127/swagger-tools/blob/master/RELEASE_NOTES.md
[swagger]: http://swagger.io/
[swagger-docs-v1_2]: https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md
[swagger-docs-v2_0]: https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md
[swagger-ui]: https://github.com/swagger-api/swagger-ui

# Improvements
## Replacing gulp

Gulp struggles with some of the nicer new parts of Node.js (linting in particular), and introduces quite a few extra dependencies. By replacing it with npm scripts we can reduce overall project size.

What Gulp is doing for us (in the form of tasks):

1. lint
   1. jshint with jshint-stylish as the reporter
2. test
   1. test-node
      1. istanbul coverage
      2. mocha test-*.js
      3. display coverage report
   2. test-browser
      1. browserify ./src/lib/specs.js (isStandalone, useDebug)
         1. true true `swagger-tools-standalone-min.js`
         2. true false `swagger-tools-standalone.js`
         3. false true `swagger-tools.min.js`
         4. false false `swagger-tools.js`
         5. * standalone excludes all the third party libs
      2. copies `swagger-tools.js` to the test dir
      3. copies `swagger-tools-standalone.js` to the test dir
      4. makeTest (version, standalone)
         1. 1.2 false bundle(`./test/1.2/test-specs.js`) `karma-bower.conf.js` 
         2. 1.2 true bundle(`./test/1.2/test-specs.js`) `karma-standalone.conf.js` 
         3. 2.0 false bundle(`./test/2.0/test-specs.js`) `karma-bower.conf.js` 
         4. 2.0 true bundle(`./test/2.0/test-specs.js`) `karma-standalone.conf.js`
      5. tidies up files

## Replacing jshint

This is a more of a personal choice, but I find integration of eslint with VSCode a nice touch, and helps keep on top of linting during development.

## Replacing Browserify

Webpack is where it is at. Struggling to make a non-standalone version of it with webpack though... maybe not the end of the world... TODO.

## Using the very latest in JavaScript features

We want to code with the latest syntax, but publish an es5 version to NPM.

## Use latest swagger-ui from NPM

We should be using https://github.com/swagger-api/swagger-ui but currently store a version in this repo which means it can drift out of date.

## CI via Github actions

PRs should trigger the previously gulpfile tasks and ensure tests are passing. Once merged the pipeline should create a release and publish it to Bower and NPM.

## OpenAPI 3.0 compatibility

This is the biggie. Currently the project only supports 1.2 and 2.0, but we need full 3.0 compatibility.
