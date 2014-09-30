One of the main reasons behind Swagger Tools initially was to provide an API around validating Swagger documents.  One
reason for this is that *real* validation of Swagger documents consists of two parts:

* Structural validation using the provided (By Swagger) [JSON Schema][json-schema] files
* Semantic validation based on what is *correct* when it comes to the values in the document that cannot be handled via
the structural validation

Seeing that everyone wants/needs this level of validation, why not create an API for everyone to use that handles all of
this stuff?

At the time of starting this project, [Swagger 2.0][swagger-2.0] was in its infancy and [Swagger 1.2][swagger-1.2] was,
and still is, the latest stable release.  With that in mind, Swagger Tools was written initially to support Swagger 1.2
but recently has been updated to support the latest version of Swagger 2.0 as best as possible.  As with any project,
this project will be updated as upstream Swagger schemas/specifications change.

## API

When you import Swagger Tools into your project (`require('swagger-tools')` for Node.js or `SwaggerTools` for the
browser), an object is returned with the following property/properties:

* **middleware:** An object whose keys are the Swagger version (dots are converted to underscores) and the value is the
also an object whose keys are the middleware name and its values are the corresponding [Connect][connect] middleware
_(Node.js only)_
* **specs:** An object whose keys are the Swagger version (dots are converted to underscores) and the value is a
`Specification` object

As of right now, since only Swagger versions 1.2 and 2.0 are supported, both `middleware` and `specs` properties have
the following keys:

* **v1:** `object` _(Pointer to the latest 1.x version which is 1.2 right now)_
* **v1_2:** `object` Swagger 1.2 support
* **v2:** `object` _(Pointer to the latest 2.x version which is 2.0 right now)_
* **v2_0:** `object` Swagger 2.0 support

### Middleware

Each version property in the `middleware` object points to a Connect middleware.  Each individual middleware is
documented in its own page (linked below) and below is the list of properties that point to the available middlwares:

* **[swaggerMetadata][swaggerMetadata]:** This is the *core* middleware that all other middlewares build on top of
* **[swaggerRouter][swaggerRouter]:** This middlware provides routing features
* **[swaggerValidator][swaggerValidator]:** This middlware provides validation features

For more details about each middleware and examples on how to use them, please view the corresponding documentation
linked to above.

### Specifications

Each version property in the `specs` object points to a `Specification` object.  The `Specification` object provides the
_API_ that you will use with your Swagger documents to do things like validation.


#### Metadata Properties

Each `Specification` object has a few metadata properties that could are useful for both users and developers:

* **docsUrl:** `string` This is a URL to the specification documentation for the corresponding Swagger version
* **primitives:** `string[]` This is an array of primitive types for the corresponding Swagger version _(This is
typically only useful for tool authors and integrations)_
* **schemas:** `object` This is an object whose keys are the schema file name and the value is the JavaScript object
representing the JSON Schema the file name corresponds with
* **schemasUrl:** `string` This is a URL to the JSON Schema(s) for the corresponding Swagger version
* **validators:** `object` This is an object whose keys are the schema file name and the value is the
[JSON Schema Validator][jjve] for that particular schema file
* **version:** This is the human readable name of the Swagger version _(Example: 1.2)_

#### Functions

The real API is provided by the functions made available on the `Specification` object.  Due to the differences between
Swagger versions 1.2 and 2.0, the functions listed below have different inputs and different outputs.  These will be
noted below.

##### #composeModel(aDOrSO, modelIdOrPtr)

**Arguments**

* **aDOrSO:** `object` The API Declaration or the Swagger Object _(For Swagger 1.2, this should be the API Declaration
object that defines the model.  For Swagger 2.0, this is the Swagger object itself.)_
* **modelIdOrPtr:** `string` The model id or the model's JSON Pointer _(For Swagger 1.2, this is the model id.  For
Swagger 2.0, this is the model id (if it's defined in `#/definitions`) or the model's JSON Pointer)_

**Returns**

This function returns an `object` that corresponds to the JSON Schema for the composed model.  Here is a full example of
this API in action:

```javascript
var spec = require('swagger-tools').specs.v2; // Using the latest Swagger 2.0 specification
var swaggerObject = require('./samples/2.0/petstore.json'); // This assumes you're in the root of the swagger-tools
var petSchema = spec.composeModel(swaggerObject, 'Pet');

console.log(JSON.stringify(petSchema, null, '  '));
```

This little script would output the following:

```json
{
  "title": "Composed #/definitions/Pet",
  "type": "object",
  "properties": {
    "category": {
      "type": "object",
      "properties": {
        "id": {
          "format": "int64",
          "type": "integer"
        },
        "name": {
          "type": "string"
        }
      }
    },
    "id": {
      "description": "unique identifier for the pet",
      "format": "int64",
      "maximum": 100,
      "minimum": 0,
      "type": "integer"
    },
    "name": {
      "type": "string"
    },
    "photoUrls": {
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "status": {
      "description": "pet status in the store",
      "enum": [
        "available",
        "pending",
        "sold"
      ],
      "type": "string"
    },
    "tags": {
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "format": "int64",
            "type": "integer"
          },
          "name": {
            "type": "string"
          }
        }
      },
      "type": "array"
    }
  },
  "required": [
    "id",
    "name"
  ]
}
```

As you can see, this JSON Schema is valid and it is fully resolved so that it is a standalone document.

##### #validate(rLOrSO, apiDeclarations)

**Arguments**

* **rLOrSO:** `object` The Resource Listing or the Swagger Object _(For Swagger 1.2, this should be the Resource
Listing.  For Swagger 2.0, this is the Swagger object itself.)_
* **apiDeclarations:** `[object[]]` The array of API Declaration objects _(For Swagger 1.2 only)_

**Returns**

`undefined` if the Swagger document(s) are valid or an `object` containing the validation errors and/or warnings.  Below
is a list of the `object` keys available on the response when it is not `undefined`:

* **apiDeclarations: _(1.2 only)_** This is an array, per API Declaration, containing an `object` each with
its own `errors` and `warnings` properties that each contain an array of error and warning objects respectively.
* **errors:** For 1.2, this is an array of the _global_ errors for the whole API.  For 2.0, this is an array of all
errors.
* **warnings:** For 1.2, this is an array of the _global_ warnings for the whole API.  For 2.0, this is an array of all
warnings.

Each error object itself has the following properties:

* **code:** This is the error/warning code
* **data:** This is the value that failed validation
* **message:** This is the human readable message describing the error/warning
* **path:** This is an array containing the _path_ to the Swagger document property that failed validation

Here is an example error:

```javascript
{
  code: 'CYCLICAL_MODEL_INHERITANCE',
  message: 'Model has a circular inheritance: Baz -> Bar -> Baz',
  data: ['Bar'],
  path: ['models', 'Baz', 'subTypes']
}
```

And here is an example of using the `validate` function:

**Swagger 2.0**

```javascript
var spec = require('swagger-tools').specs.v2; // Using the latest Swagger 2.x specification
var swaggerObject = require('./samples/2.0/petstore.json'); // This assumes you're in the root of the swagger-tools
var result = spec.validate(swaggerObject);

if (typeof result !== 'undefined') {
  if (result.errors.length > 0) {
    console.log('The server could not start due to invalid Swagger document...');

    console.log('');

    console.log('Errors');
    console.log('------');

    result.errors.forEach(function (err) {
      console.log('#/' + err.path.join('/') + ': ' + err.message);
    });

    console.log('');
  }

  if (result.warnings.length > 0) {
    console.log('Warnings');
    console.log('--------');

    result.warnings.forEach(function (warn) {
      console.log('#/' + warn.path.join('/') + ': ' + warn.message);
    });
  }

  if (result.errors.length > 0) {
    process.exit(1);
  }
} else {
  console.log('Swagger document is valid');
}
```

**Swagger 1.2**

```javascript
'use strict';

var spec = require('swagger-tools').specs.v1; // Using the latest Swagger 1.x specification
var resourceListing = require('./samples/1.2/resourceListing.json'); // This assumes you're in the root of the swagger-tools
var apiDeclarations = [
  require('./samples/1.2/pet.json'), // This assumes you're in the root of the swagger-tools
  require('./samples/1.2/store.json'), // This assumes you're in the root of the swagger-tools
  require('./samples/1.2/user.json') // This assumes you're in the root of the swagger-tools
];
var result = spec.validate(resourceListing, apiDeclarations);
var apiDeclarations = [
  require('./api/weather.json')
];

// Validate the Swagger documents
var result = swaggerTools.specs.v1.validate(apiDocJson, apiDeclarations);
var errorCount = 0;

if (typeof result !== 'undefined') {
  console.log('The server could not start due to invalid Swagger document...');

  console.log('');

  if (result.errors.length > 0) {
    errorCount += result.errors.length;

    console.log('Errors');
    console.log('------');

    result.errors.forEach(function (err) {
      console.log('#/' + err.path.join('/') + ': ' + err.message);
    });

    console.log('');
  }

  if (result.warnings.length > 0) {
    console.log('Warnings');
    console.log('--------');

    result.warnings.forEach(function (warn) {
      console.log('#/' + warn.path.join('/') + ': ' + warn.message);
    });

    console.log('');
  }

  if (result.apiDeclarations) {
    result.apiDeclarations.forEach(function (adResult, index) {
      var errorHeader = 'API Declaration (' + apiDeclarations[index].resourcePath + ') Errors';
      var warningHeader = 'API (' + apiDeclarations[index].resourcePath + ') Warnings';

      if (adResult.errors.length > 0) {
        errorCount += adResult.errors.length;

        console.log(errorHeader);
        console.log(new Array(errorHeader.length + 1).join('-'));

        adResult.errors.forEach(function (err) {
          console.log('#/' + err.path.join('/') + ': ' + err.message);
        });

        console.log('');
      }

      if (adResult.warnings.length > 0) {
        console.log(warningHeader);
        console.log(new Array(warningHeader.length + 1).join('-'));

        adResult.warnings.forEach(function (warn) {
          console.log('#/' + warn.path.join('/') + ': ' + warn.message);
        });

        console.log('');
      }
    });
  }

  if (errorCount > 0) {
    process.exit(1);
  }
} else {
  console.log('Swagger document is valid');
}
```

##### #validateModel(aDOrSO, modelIdOrPtr, data)

**Arguments**

* **aDOrSO:** `object` The API Declaration or the Swagger Object _(For Swagger 1.2, this should be the API Declaration
object that defines the model.  For Swagger 2.0, this is the Swagger object itself.)_
* **modelIdOrPtr:** `string` The model id or the model's JSON Pointer _(For Swagger 1.2, this is the model id.  For
Swagger 2.0, this is the model id (if it's defined in `#/definitions`) or the model's JSON Pointer)_
* **data:** `object|array` The object representing the model to be validated

**Returns**

`undefined` if the Swagger document(s) are valid or an `object` containing the validation errors.  The error object is
structured identically to that of the `#validate` method.

Here is a full example of this API in action:

```javascript
var spec = require('swagger-tools').specs.v2; // Using the latest Swagger 2.x specification
var swaggerObject = require('./samples/2.0/petstore.json'); // This assumes you're in the root of the swagger-tools
var result = spec.validateModel(swaggerObject, 'Pet', {
  id: 1,
  name: 'Some Pet Name'
});

if (result) {
  console.log('Swagger model failed validation:');

  console.log('Errors');
  console.log('------');

  result.errors.forEach(function (err) {
    console.log('#/' + err.path.join('/') + ': ' + err.message);
  });

  // Since this is schema validation, warnings shouldn't be populated
} else {
  console.log('Swagger model is valid');
}
```

[connect]: https://github.com/senchalabs/connect
[jjve]: https://github.com/acornejo/jjv
[json-schema]: http://json-schema.org/
[swagger]: http://swagger.io
[swaggerMetadata]: https://github.com/apigee-127/swagger-tools/blob/master/docs/Middleware.md#swagger-metadata
[swaggerRouter]: https://github.com/apigee-127/swagger-tools/blob/master/docs/Middleware.md#swagger-router
[swaggerValidator]: https://github.com/apigee-127/swagger-tools/blob/master/docs/Middleware.md#swagger-validator
[swagger-1.2]: https://github.com/reverb/swagger-spec/blob/master/versions/1.2.md
[swagger-2.0]: https://github.com/reverb/swagger-spec/blob/master/versions/2.0.md
