Swagger Tools provides a few [Connect][connect] middlewares to help you utilize your Swagger documents.  Each middleware
is documented below.

**Note:** All middlewares for the different Swagger versions function the same but due to the differences between the
Swagger versions, some function arguments are different and so is the `swagger` object attached to the `req` object.  In
the cases where this applies, notation will be made below.

## Swagger Middleware Initialization

The Swagger middleware requires validated Swagger document(s).  To ensure that this is the case, Swagger Tools ships
with an `initializeMiddleware` method that will validate your Swagger document(s) and then pass the Swagger version
specific middleware functions to you.  Here is an example:

**Swagger 2.0**

```javascript
var initializeSwagger = require('swagger-tools').initializeMiddleware;
var app = require('connect')();

// This assumes you're in the root of the swagger-tools
var swaggerObject = require('./samples/2.0/petstore.json');

// Configure non-Swagger related middleware and server components prior to Swagger middleware

initializeSwagger(swaggerObject, function (swaggerMiddleware) {
  // Initialize the Swagger middleware (Examples below)
  // Initialize the remaining server components
  // Start server
});
```

**Swagger 1.2**

```javascript
var initializeSwagger = require('swagger-tools').initializeMiddleware;
var app = require('connect')();

// This assumes you're in the root of the swagger-tools
var petJson = require('./samples/1.2/pet.json');
var rlJson = require('./samples/1.2/resource-listing.json');
var storeJson = require('./samples/1.2/store.json');
var userJson = require('./samples/1.2/user.json');

// Configure non-Swagger related middleware and server components prior to Swagger middleware

initializeSwagger(rlJson, [petJson, storeJson, userJson], function (swaggerMiddleware) {
  // Initialize the Swagger middleware (Examples below)
  // Initialize the remaining server components
  // Start server
});
```

`initializeMiddlware` will halt server startup upon any unrecoverable Swagger document(s) validation error, printing out
the errors/warnings in that case.  The argument passed to the callback has the following properties, each corresponding
to a middleware function documented below.  The order in the following list is the suggested `app.use` order:

* **swaggerMetadata:** This is the base middleware that will analyze a request route, match it to an API in your
Swagger document(s) and then annotate the request, using `req.swagger`, with the pertinent details.
* **swaggerSecurity:** This middleware allows you to wire up authentication/authorization handlers based on the
definitions in your Swagger document(s).
* **swaggerValidator:** This middleware will validate your request/responses based on the operations in your Swagger
document(s).
* **swaggerRouter:** This middleware allows you to wire up request handlers based on the operation definitions in your
Swagger document(s).
* **swaggerUi:** This middleware will serve your Swagger document(s) for public consumption and will also serve a local
[Swagger UI][swagger-ui] instance.

## Swagger Middleware Debugging

All Swagger Middleware uses the [debug](debug) module to allow you to have a better idea of what is going on during the
middleware initialization and processing lifecycle.  To enable debugging globally, just set the `DEBUG` environment
variable to be `swagger-tools:middleware:*`.  If you want to only see debugging output for a specific middleware, you
can do that too.  To do so, you sould set `DEBUG` to a value like this:
`swagger-tools:middleware:{middlware-short-name}` where the `middleware-short-name` is one of the following: `metadata`,
`router`, `security`, `ui` or `validator`.  So if I wanted to see only swagger-validator debugging information, I would
set `DEBUG` to `swagger-tools:middleware:validator`.  Here is an example of starting a Node.js server with debugging
enabled for all Swagger middlewares:

```
DEBUG=swagger-tools:middleware:* node .
  swagger-tools:middleware Initializing middleware +0ms
  swagger-tools:middleware   Identified Swagger version: 2.0 +1ms
  swagger-tools:middleware   Validation: succeeded +19ms
  swagger-tools:middleware:metadata Initializing swagger-metadata middleware +23ms
  swagger-tools:middleware:metadata   Identified Swagger version: 2.0 +1ms
  swagger-tools:middleware:metadata   Found Path: /weather +1ms
  swagger-tools:middleware:validator Initializing swagger-validator middleware +1ms
  swagger-tools:middleware:validator   Response validation: disabled +0ms
  swagger-tools:middleware:router Initializing swagger-metadata middleware +0ms
  swagger-tools:middleware:router   Mock mode: disabled +0ms
  swagger-tools:middleware:router   Controllers: +0ms
  swagger-tools:middleware:router     /Users/notyou/projects/weather/controllers/Weather.js: +113ms
  swagger-tools:middleware:router       Weather_getWeather +0ms
  swagger-tools:middleware:ui Initializing swagger-ui middleware +17ms
  swagger-tools:middleware:ui   Using swagger-ui from: internal +1ms
  swagger-tools:middleware:ui   API Docs path: /api-docs +0ms
  swagger-tools:middleware:ui   swagger-ui path: /docs +0ms
Your server is listening on port 3000 (http://localhost:3000)
  swagger-tools:middleware:metadata GET /api/weather?location=80538 +38s
  swagger-tools:middleware:metadata   Is a Swagger path: true +0ms
  swagger-tools:middleware:metadata   Is a Swagger operation: true +0ms
  swagger-tools:middleware:metadata   Processing Parameters +0ms
  swagger-tools:middleware:metadata     location +2ms
  swagger-tools:middleware:metadata       Type: string +0ms
  swagger-tools:middleware:metadata       Value provided: true +0ms
  swagger-tools:middleware:metadata       Value: 80538 +0ms
  swagger-tools:middleware:metadata     unit +0ms
  swagger-tools:middleware:metadata       Type: string +0ms
  swagger-tools:middleware:metadata       Value provided: false +0ms
  swagger-tools:middleware:metadata       Value: F +0ms
  swagger-tools:middleware:validator GET /api/weather?location=80538 +0ms
  swagger-tools:middleware:validator   Will process: yes +0ms
  swagger-tools:middleware:router GET /api/weather?location=80538 +1ms
  swagger-tools:middleware:router   Will process: yes +0ms
  swagger-tools:middleware:router   Route handler: Weather_getWeather +0ms
  swagger-tools:middleware:router   Mock mode: false +0ms
```

To see mode documentation on how to further talior the debugging to your needs, please view the [debug](debug) module
documentation.

## Swagger Middleware Errors

All Swagger Middleware errors are sent downstream per Connect middleware standards.  This means that no Swagger
Middleware will handle errors for you nor will they attempt to render your errors on your behalf.  That being said, the
Swagger Middleware does annotate validation errors before sending them downstream so that the downstream consumer can
identify these errors and get the pertinent information out of them.

### Validation Errors

Anytime a Swagger validation error occurs, the following `Error` properties will be available if available:

* **apiDeclarations:** {object[]} - The API Declaration errors _(Swagger 1.2)_
* **errors:** {object[]} - The validation errors
* **failedValidation:** {boolean} - Indicating the error is a validation error
* **originalResponse:** {\*} - The original response payload sent via `res.end` that triggered the response
validation failure _(All other response related fields like headers, status code, etc. are already avaliable on the
`res` available to all downstream middlewares like the error handlers.)_
* **warnings:** {object[]} - The validation warnings

Use these pieces of information to properly render your errors.

## Swagger Metadata

The Swagger Metadata middleware is the base for all other Swagger Tools middleware and it attaches Swagger information
to the request (`req.swagger`) when a request matches a route define in your Swagger document(s).  For requests where
the route does not match a route defined in your Swagger document(s), this middleware does nothing.  Since Swagger 1.2
and Swagger 2.0 differ both in Swagger document structure and terminology, this middleware takes different parameters
based on Swagger version and it uses different property names on the `req.swagger` object.

The Swagger Metadata middleware is useful because it allows you to easily get access to the pertinent Swagger document
information for your request in your request handler.  This does not require you to use any other Swagger Tools
metadata.  Why might you want to do this?  Imagine you wanted to annotate your Swagger 2.0 documents using vendor
extensions in a way that is useful to your implementation, like cache information or quota information.  By attaching
the request path and the request operation to the `req` object, you can easily get access to your vendor extension
annotations to make life easier.

Swagger Metadata also processes your request parameters for you.  So no matter how the parameters are provided (body,
header, form data, query string, ...), as described in your Swagger document(s), the processing is handled for you to
get the parameter values. _(No validation of the parameter values happens in the Swagger Metadata middleware.)_  During
this process, Swagger Metadata will use [body-parser][body-parser] and [qs][qs] for body and query
string parsing respectively if you do not provide your own parsers.

### Swagger 1.2

#### #swaggerMetadata()

**Returns**

The Connect middleware function.

**Note:** Since Swagger Metadata is used by the other Swagger Tools middleware, it must be used before the other
Swagger Tools middleware.

#### req.swagger

The structure of `req.swagger` is as follows:

* **api:** `object` The corresponding API in the API Declaration that the request maps to
* **apiDeclaration:** `object` The corresponding API Declaration that the request maps to
* **apiIndex:** `number` The index of the API Declaration as it was passed to `initializeMetadata`
* **authorizations:** `object` The computed authorizations for this request
* **operation:** `object` The corresponding operation in the API Declaration that the request maps to
* **operationPath:** `string[]` The path to the operation
* **params:** `object` For each of the request parameters defined in your Swagger document, its `path`, its `schema`,
its `originalValue` and its processed `value`.  The value is converted to the proper JSON type based on the Swagger
document.  If the parameter defined in your Swagger document includes a default value and the request does not include
the value, the default value is assigned to the parameter value in `req.swagger.params`.
* **resourceListing:** `object` The Resource Listing for the API

### Swagger 2.0

**Returns**

The Connect middleware function.

#### req.swagger

The structure of `req.swagger` is as follows:

* **apiPath:** `string` The API's path (The key used in the `paths` object for the corresponding API)
* **path:** `object` The corresponding path in the Swagger object that the request maps to
* **operation:** `object` The corresponding operation in the API Declaration that the request maps to
* **operationParameters:** `object[]` The computed parameters for this operation
* **operationPath:** `string[]` The path to the operation
* **params:** `object` For each of the request parameters defined in your Swagger document, its `path`, its `schema`
and its processed `value`
* **security:** `object[]` The computed security for this request
* **swaggerObject:** `object` The Swagger object

## Swagger Router

The Swagger Router middleware provides facilities for wiring up request handlers, as defined in your Swagger
document(s).  Since your Swagger document(s) already define your API routes, Swagger Router provides a lightweight
approach to wiring up the router handler implementation function to the proper route based on the information in your
Swagger document(s).

Both Swagger 1.2 and Swagger 2.0 middlewares are instantiated the same but how the wiring is defined is different
between the two.

### #swaggerRouter(options)

**Arguments**

* **options:** `[object]` The configuration options
* **options.controllers:** `[string|string[]|object]` The controllers to look for or use.  If the value is a string,
we assume the value is a path to a directory that contain controller modules.  If the value is an array, we assume the
value is an array of paths to directories that contain controller modules.  If the value is an object, we assume the
object keys are the handler name _({ControllerName}_{HandlerFunctionName}) and the value is a function.
* **options.useStubs:** `[boolean]` Whether or not stub handlers should be used for routes with no defined controller
or the controller could not be found.

**Returns**

The Connect middleware function.

**Note:** Since Swagger Router will actually return a response, it should be as close to the end of your middleware
chain as possible.

### req.swagger

The structure of `req.swagger` is updated to include the following:

* **useStubs:** `boolean` The value of `options.useStubs`

### How to Use

For Swagger Router to work, your Swagger document(s) need to be updated to indicate how to find the controller (by name)
and the controller function.  Due to the differences between Swagger 1.2 and Swagger 2.0, the requirements are different
and are documented below.

#### Swagger 1.2

Since Swagger 1.2 does not allow you to add additional properties to your Swagger documents, Swagger Router has to use
an existing Swagger document property to handle the routing.  Since Swagger 1.2 requires all operation objects to have a
`nickname` property, we use it by overloading its value to give Swagger Router what it needs.

The value of the operation's `nickname` property is in the format of `{ControllerName}_{HandlerFunction}`.  So if you
have a `Pet` controller and want your operation to map to its `getById` function, your operation's `nickname` property
would have a value of `Pet_getById`.

#### Swagger 2.0

Since Swagger 2.0 has a new feature called **Vendor Extensions** which allows you to add additional properties
throughout your Swagger documents as long as they start with `x-`.  Swagger Router uses a vendor extension named
`x-swagger-router-controller` to help with the routing.  Basically, `x-swagger-router-controller` can be defined at the
path level and/or the operation level and it tells the controller name to use.  To define the controller to use for an
operation, just define the `x-swagger-router-controller` property at the operation level.  What if you want to reuse the
same controller for multiple/all operations in a path?  Just define the `x-swagger-router-controller` property at the
path level.  Of course if you've defined `x-swagger-router-controller` at the path level and you want to use a different
controller for any operation below that path, you can override the path controller by defining the
`x-swagger-router-controller` at the operation level.

When it comes to finding the controller function to call, there are two options.  The default is to use the operation
name for the operation, which corresponds to the HTTP verb being used.  If you want to override this default and use a
different name, just define the `operationId` property on your operation.  Here is an example Swagger document snippet
where each operation tells you which controller and function will be used based on its definition:

```json
{
  "swagger": 2.0,
  "info": {
    "version": "1.0.0",
    "title": "Swagger Router Example"
  },
  "paths": {
    "/pets/{id}": {
      "x-swagger-router-controller": "Pets",
      "delete": {
        "description": "Swagger router would look for a 'deletePet' function in the 'Pets' controller",
        "operationId": "deletePet",
        "responses": {
          "204": {
            "description": "Pet deleted"
          },
          "default": {
            "description": "Unexpected error",
            "schema": {
              "$ref": "#/definitions/Error"
            }
          }
        }
      },
      "get": {
        "description": "Swagger router would look for a 'get' function in the 'Pets' controller",
        "responses": {
          "200": {
            "description": "Pet response",
            "schema": {
              "$ref": "#/definitions/Pet"
            }
          },
          "default": {
            "description": "Unexpected error",
            "schema": {
              "$ref": "#/definitions/Error"
            }
          }
        }
      },
      "post": {
        "x-swagger-router-controller": "PetsAdmin",
        "description": "Swagger router would look for a 'createPet' function in the 'PetsAdmin' controller",
        "operationId": "createPet",
        "responses": {
          "201": {
            "description": "Pet created"
          },
          "default": {
            "description": "Unexpected error",
            "schema": {
              "$ref": "#/definitions/Error"
            }
          }
        }
      },
      "put": {
        "x-swagger-router-controller": "PetsAdmin",
        "description": "Swagger router would look for a 'put' function in the 'PetsAdmin' controller",
        "responses": {
          "201": {
            "description": "Pet updated"
          },
          "default": {
            "description": "Unexpected error",
            "schema": {
              "$ref": "#/definitions/Error"
            }
          }
        }
      },
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "description": "ID of pet",
          "required": true,
          "type": "integer",
          "format": "int64"
        }
      ]
    }
  },
  "definitions": {
    "Pet": {
      "id": "Pet",
      "properties": {
        "id": {
          "type": "integer"
        },
        "name": {
          "type": "string"
        }
      },
      "required": [
        "id",
        "name"
      ]
    },
    "Error": {
      "required": [
        "code",
        "message"
      ],
      "properties": {
        "code": {
          "type": "integer",
          "format": "int32"
        },
        "message": {
          "type": "string"
        }
      }
    }
  }
}
```

A new option (since 0.8.4) is the addition of the `x-swagger-router-handle-subpaths` extension to the Swagger path
component. By setting this property to `true`, it indicates to Swagger Router that it should match and route all 
requests to not only the specified path, but also any undeclared subpaths requested that do not match an explicitly 
defined path in the Swagger. While you cannot specify wildcards in Swagger, this would be the spiritual equivalent
of wildcarding the end of the path something like `/pets/**`. For example, the following Swagger would cause 
Swagger Router to match and route `/pets`, `/pets/1`, or even `/pets/this/is/an/arbitrary/route` to the `Pets`
controller:

```json
{
  "swagger": 2.0,
  "info": {
    "version": "1.0.0",
    "title": "Swagger Subpath Example"
  },
  "paths": {
    "/pets": {
      "x-swagger-router-controller": "Pets",
      "x-swagger-router-handle-subpaths": true,
      "get": {
        "description": "",
        "responses": {
          "default": {
            "description": "default",
            "schema": {
              "$ref": "#/definitions/Default"
            }
          }
        }
      }
    }
  }
}
```


### Mock Mode

Swagger Router also comes with a feature that can be useful during testing and/or design time.  This feature will
automatically handle routes that are defined in your Swagger document(s) as having route handlers but their configured
controller and/or handler function is missing.  The response content is inferred from your Swagger document(s).  So if
your operation says that the requested API will return an integer, mock mode will return an integer.  If your operation
says that the requested API will return a model, mock mode will return a JSON representation of that model.  For the
example `Pet` above, mock mode would return the following:

```json
{
  "id": 1,
  "name": "Sample text"
}
```

To enable mock mode, just pass the `useStubs` option as `true` to the `swaggerRouter` middleware.  Both of the complete
examples below demonstrate how to do this.

This feature is nice to see how your API should respond based on what you've configured prior to implementing the actual
route handler in code.  This is obviously something that should be disabled in production.

#### Caveats

Mock mode is a relatively new feature to Swagger Router and while it's cool as-is, there are a few things that need to
be done to make it better.  This is currently being tracked in [Issue #30][issue-30].

## Swagger Security

The Swagger Security middleware is used to authenticate/authorize requests based on the authorization/security
definitions and references in your Swagger document(s).

#### #swaggerSecurity(options)

**Arguments**

* **options:** `object` The middleware options
* **options[name]:** `object` For the authorization/security name, the value is a function that will be used to
perform the authentication/authorization.  The function signature for the callback is:
`function (req, authOrSecDef, scopesOrApiKey, callback)`.

**Returns**

The Connect middleware function.

## Swagger UI

The Swagger UI middleware is used to serve your Swagger document(s) via an API and also to serve
[Swagger UI][swagger-ui] on your behalf.

**Note:** This middleware is completely standalone and does not require `swaggerMetadata`.

#### #swaggerUi(options)

**Arguments**

* **options:** `object` The middleware options
* **options.apiDocs:** `string=/api-docs` The path to serve the Swagger documents from
* **options.swaggerUi:** `string=/docs` The path to serve Swagger UI from
* **options.swaggerUiDir:** `string` The filesystem path to your custom swagger-ui deployment to serve

**Returns**

The Connect middleware function.

### Swagger Documents

For Swagger 2.0, there is only one Swagger document and it is served at the path configured by `options.apiDocs`.  For
Swagger 1.2, there is a Resource Listing document and one document per API Declaration (resource) your API ships with.
The Resource Listing document is served at the path configured by `options.apiDocs` and the API Declaration documents
are served at their respective subpath below the path configured by `options.apiDocs`.  To see an example of this, view
the [complete example](#complete-example) below for your Swagger version to see the paths exposed by the `swaggerUi`
middleware.

## Swagger Validator

The Swagger Validator middleware is used to validate your requests/responses based on the constraints defined in the
operation parameters of your Swagger document(s).  So if your operation has a required parameter and your request does
not provide it, the Swagger Validator will send an error downstream in typical Connect fashion.  Or if your operation is
suppose to return `application/x-yaml` but it returns `application/json`, it will do the same.

**Arguments**

* **options:** `object` The middleware options
* **options.validateResponse:** `[boolean=false]` Whether or not to validate responses

**Returns**

## Complete Example

Here is a complete example for using all middlewares documented above:

**Swagger 2.0**

```javascript
var swagger = require('swagger-tools');
var swaggerObject = require('./samples/2.0/petstore.json'); // This assumes you're in the root of the swagger-tools

var connect = require('connect');
var http = require('http');
var app = connect();

// Initialize the Swagger Middleware
swagger.initializeMiddleware(swaggerObject, function (middleware) {
  // Interpret Swagger resources and attach metadata to request - must be first in swagger-tools middleware chain
  app.use(middleware.swaggerMetadata());

  // Provide the security handlers
  app.use(middleware.swaggerSecurity({
    oauth2: function (req, def, scopes, callback) {
      // Do real stuff here
    }
  }));

  // Validate Swagger requests
  app.use(middleware.swaggerValidator({
    validateResponse: true
  }));

  // Route validated requests to appropriate controller
  app.use(middleware.swaggerRouter({useStubs: true, controllers: './controllers'}));

  // Serve the Swagger documents and Swagger UI
  //   http://localhost:3000/docs => Swagger UI
  //   http://localhost:3000/api-docs => Swagger document
  app.use(middleware.swaggerUi());

  // Start the server
  http.createServer(app).listen(3000);
});
```

**Swagger 1.2**

```javascript
var swagger = require('swagger-tools');
var resourceListing = require('./samples/1.2/resourceListing.json'); // This assumes you're in the root of the swagger-tools
var apiDeclarations = [
  require('./samples/1.2/pet.json'), // This assumes you're in the root of the swagger-tools
  require('./samples/1.2/store.json'), // This assumes you're in the root of the swagger-tools
  require('./samples/1.2/user.json') // This assumes you're in the root of the swagger-tools
];

var connect = require('connect');
var http = require('http');
var app = connect();

// Initialize the Swagger Middleware
swagger.initializeMiddleware(swaggerObject, function (middleware) {
  // Interpret Swagger resources and attach metadata to request - must be first in swagger-tools middleware chain
  app.use(middleware.swaggerMetadata());

  // Provide the security handlers
  app.use(middleware.swaggerSecurity({
    oauth2: function (req, def, scopes, callback) {
      // Do real stuff here
    }
  }));

  // Validate Swagger requests
  app.use(swaggerValidator({
    validateResponse: true
  }));

  // Route validated requests to appropriate controller
  app.use(swaggerRouter({useStubs: true, controllers: './controllers'}));

  // Serve the Swagger documents and Swagger UI
  //   http://localhost:3000/docs => Swagger UI
  //   http://localhost:3000/api-docs => Resource Listing JSON
  //   http://localhost:3000/api-docs/pet => Pet JSON
  //   http://localhost:3000/api-docs/store => Store JSON
  //   http://localhost:3000/api-docs/user => User JSON
  app.use(swaggerUi(rlJson, {
    '/pet': apiDeclarations[0],
    '/store': apiDeclarations[1],
    '/user': apiDeclarations[2]
  }));

  // Start the server
  http.createServer(app).listen(3000);
});
```

[body-parser]: https://github.com/expressjs/body-parser
[connect]: https://github.com/senchalabs/connect
[debug]: https://github.com/visionmedia/debug
[issue-30]: https://github.com/apigee-127/swagger-tools/issues/30
[qs]: https://github.com/hapijs/qs
[swagger-ui]: https://github.com/wordnik/swagger-ui
