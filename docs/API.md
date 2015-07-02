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

* **initializeMiddleware:** Function used to initialize the Swagger [Connect][connect] middleware.  _(During this
phase we validate your Swagger document(s))_  This function is documented in the [middleware][middleware] documentation.
_(Node.js only)_
* **specs:** An object whose keys are the Swagger version (dots are converted to underscores) and the value is a
`Specification` object

As of right now, since only Swagger versions 1.2 and 2.0 are supported, the `specs` object has the following properties:

* **v1:** `object` _(Pointer to the latest 1.x version which is 1.2 right now)_
* **v1_2:** `object` Swagger 1.2 support
* **v2:** `object` _(Pointer to the latest 2.x version which is 2.0 right now)_
* **v2_0:** `object` Swagger 2.0 support

All functions take an _error-first_ callback where if any upstream error occurs not directly related to the API being
called, this error will be passed as the first argument.  An example of this is if you call `Specification#validate` and
you have a JSON Reference to some path that cannot be resolved or if you call `Specification#composeModel` and the model
or the document it is contained within fails validation.

The second argument, not always required so check the documentation below, will typically be the result of the API being
called.  So for `Specification#validate`, the response object would be the validation results.  _(The reason this is not
sent back as the `err` argument is because validation results are not themselves an error and are the result of a
successful API call.)_  Another example would be `Specification#composeModel` would return the composed JSON Schema for
the model requested.

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

##### #composeModel(aDOrSO, modelIdOrPtr, callback)

**Arguments**

* **aDOrSO:** `object` The API Declaration or the Swagger Object _(For Swagger 1.2, this should be the API Declaration
object that defines the model.  For Swagger 2.0, this is the Swagger object itself.)_
* **modelIdOrRef:** `string` The model id or the model's JSON Reference pointer string _(For Swagger 1.2, this is the
model id.  For Swagger 2.0, this is the JSON Reference pointer string)_
* **callback:** `function` The error-first callback to call with the response or any upstream errors not related to
invalid arguments

**Returns**

This function returns an `object` that represents the JSON Schema for the model id (Swagger 1.2) or the JSON Reference
(Swagger 2.0).  Here is a full example of this API in action:

**Note:** For Swagger 1.2, we only perform structural validation prior to composing the model.

**Swagger 2.0**

```javascript
var spec = require('swagger-tools').specs.v2; // Using the latest Swagger 2.x specification
var swaggerObject = require('./samples/2.0/petstore.json'); // This assumes you're in the root of the swagger-tools

spec.composeModel(swaggerObject, '#/definitions/Pet', function (err, schema) {
  if (err) {
    throw err;
  }

  console.log(JSON.stringify(schema, null, '  '));
});
```

**Swagger 1.2**

```javascript
var spec = require('swagger-tools').specs.v1; // Using the latest Swagger 1.x specification
var petJson = require('./samples/1.2/pet.json'); // This assumes you're in the root of the swagger-tools

spec.composeModel(petJson, 'Pet', function (err, schema) {
  if (err) {
    throw err;
  }

  console.log(JSON.stringify(schema, null, '  '));
});
```

These examples would output something like the following:

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

##### #convert(resourceListing, apiDeclarations, skipValidation, callback)

**Arguments**

* **resourceListing:** `object` The Resource Listing
* **apiDeclarations:** `[object[]]` The array of API Declaration objects
* **skipValidation:** `[boolean=false]` Whether or not to skip validation prior to conversion
* **callback:** `function` The error-first callback to call with the response or any upstream errors not related to
  invalid arguments

**Returns**

This function returns an `object` that represents the converted Swagger 2.0 document.

**Notes**

_Does not work with Swagger 2.0_

Here is an example:

```javascript
var resourceListing = require('./samples/1.2/resourceListing.json'); // This assumes you're in the root of the swagger-tools
var apiDeclarations = [
  require('./samples/1.2/pet.json'), // This assumes you're in the root of the swagger-tools
  require('./samples/1.2/store.json'), // This assumes you're in the root of the swagger-tools
  require('./samples/1.2/user.json') // This assumes you're in the root of the swagger-tools
];
var spec = require('swagger-tools').specs.v1; // Using the latest Swagger 1.x specification

try {
  spec.convert(resourceListing, apiDeclarations, function (err, converted) {
    if (err) {
      throw err;
    }

    console.log(JSON.stringify(converted, null, 2));
  });
} catch (err) {
  // Can be thrown if validation fails (Pass skipValidation of true if need be)
  throw err;
}
```

##### #resolve(document, ptr, callback)

**Arguments**

* **document:** `object` The document to resolve or the document containing the reference to resolve
* **ptr:** `string` The JSON Pointer or undefined to return the whole document
* **callback:** `function` The error-first callback to call with the response or any upstream errors not related to
invalid arguments

**Returns**

A fully resolved JSON Schema representation of the document or path within the document, or `undefined` if the document
does not contain a path corresponding to the pointer

**Notes**

_Does not work with Swagger 1.2 since those documents are not valid JSON Schema documents_

Here is an example:

**Swagger 2.0**

```javascript
var spec = require('swagger-tools').specs.v2; // Using the latest Swagger 2.x specification
var swaggerObject = require('./samples/2.0/petstore.json'); // This assumes you're in the root of the swagger-tools

spec.resolve(swaggerObject, function (err, result) {
  if (err) {
    throw err;
  }

  if (!result) {
    console.log('%s does not correspond with a path in the provided document', ptr);
  } else {
    console.log(JSON.stringify(result));
  }
});
```

This API could be confused with `Specification#composeModel` but this API does not work with Swagger 1.x and it can
resolve any path within the document, not just models.

##### #validate(rLOrSO, apiDeclarations, callback)

**Arguments**

* **rLOrSO:** `object` The Resource Listing or the Swagger Object _(For Swagger 1.2, this should be the Resource
Listing.  For Swagger 2.0, this is the Swagger object itself.)_
* **apiDeclarations:** `[object[]]` The array of API Declaration objects _(For Swagger 1.2 only)_
* **callback:** `function` The error-first callback to call with the response or any upstream errors not related to
invalid arguments

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
* **message:** This is the human readable message describing the error/warning
* **path:** This is an array containing the _path_ to the Swagger document property that failed validation
* **description:** The description of the JSON Schema entry _(Optional)_

The Error object can also have an `inner` property with a list of nested errors where applicable.

Here is an example error:

```javascript
{
  code: 'CYCLICAL_MODEL_INHERITANCE',
  message: 'Model has a circular inheritance: Baz -> Bar -> Baz',
  path: ['models', 'Baz', 'subTypes']
}
```

And here is an example of using the `validate` function:

**Swagger 2.0**

```javascript
var spec = require('swagger-tools').specs.v2; // Using the latest Swagger 2.x specification
var swaggerObject = require('./samples/2.0/petstore.json'); // This assumes you're in the root of the swagger-tools

spec.validate(swaggerObject, function (err, result) {
  if (err) {
    throw err;
  }

  if (typeof result !== 'undefined') {
    if (result.errors.length > 0) {
      console.log('The Swagger document is invalid...');

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
});
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

spec.validate(resourceListing, apiDeclarations, function (err, result) {
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
});
```

##### #validateModel(aDOrSO, modelIdOrRef, data, callback)

**Arguments**

* **aDOrSO:** `object` The API Declaration or the Swagger Object _(For Swagger 1.2, this should be the API Declaration
object that defines the model.  For Swagger 2.0, this is the Swagger object itself.)_
* **modelIdOrRef:** `string` The model id or the model's JSON Reference pointer string _(For Swagger 1.2, this is the
  model id.  For Swagger 2.0, this is the JSON Reference pointer string)_
* **data:** `object|array` The object representing the model to be validated
* **callback:** `function` The error-first callback to call with the response or any upstream errors not related to
invalid arguments

**Returns**

`undefined` if the Swagger document(s) are valid or an `object` containing the validation errors.  The error object is
structured identically to that of the `#validate` method.

**Note:** For Swagger 1.2, we only perform structural validation prior to composing the model.

Here is a full example of this API in action:

**Swagger 2.0**

```javascript
var spec = require('swagger-tools').specs.v2; // Using the latest Swagger 2.x specification
var swaggerObject = require('./samples/2.0/petstore.json'); // This assumes you're in the root of the swagger-tools

spec.validateModel(swaggerObject, '#/definitions/Pet', {
  id: 1,
  name: 'Some Pet Name'
}, function (err, result) {
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
});
```

**Swagger 1.2**

```javascript
var spec = require('swagger-tools').specs.v1; // Using the latest Swagger 1.x specification
var petJson = require('./samples/1.2/pet.json'); // This assumes you're in the root of the swagger-tools

spec.validateModel(petJson, 'Pet', {
  id: 1,
  name: 'Some Pet Name'
}, function (err, result) {
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
});
```

[connect]: https://github.com/senchalabs/connect
[json-schema]: http://json-schema.org/
[middleware]: https://github.com/apigee-127/swagger-tools/blob/master/docs/Middleware.md
[swagger]: http://swagger.io
[swagger-1.2]: https://github.com/reverb/swagger-spec/blob/master/versions/1.2.md
[swagger-2.0]: https://github.com/reverb/swagger-spec/blob/master/versions/2.0.md
