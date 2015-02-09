One of the major parts of Swagger Tools is its comprehensive validation.  What most people don't realize when validating
Swagger documents is that there are two sources of truth for validating Swagger documents against a particular version
of Swagger:

* The [JSON Schema][json-schema] file(s)
* The Swagger Specification documentation

To properly validate a Swagger document, the Swagger Specification document for the Swagger version in question is the
source of truth.  This means that while the JSON Schema file(s) are important to initially validate the structure of
your Swagger document, there may be some situations where the JSON Schema does not fullfil the complete contract as
described in the Swagger specification documentation.  This is where swagger-tools has stepped in to help pave the way
for doing full Swagger document validation.  swagger-tools starts all Swagger document validation using the JSON Schema
file(s) and only once that validation passes will swagger-tools go through each pertinent _semantic_ validation in its
catalog to do the rest of the validation.

The purpose of this document is to serve as a human readable version of this catalog, a per-Swagger version list of the
_extra_ validation required on top of the JSON Schema validation to _really_ validate a Sawgger document.  My hope is
that this document could be used by Swagger maintainers to enhance their JSON Schema files, where possible, to
alleviate the need for _extra_ validation.  I also hope that this document could be used as a template of sorts for
others when writing Swagger validators in other languages, or even in JavaScript if you don't like what swagger-tools
brings to the table.

One last thing before we get into the specifics, there are some situations that are flagged as a _warning_ in
swagger-tools.  Warnings in swagger-tools are situations where the Swagger specification contract is not broken but
there is a good chance you have done something you did not mean to, like creating a model definition and then not
using it anywhere.  In the documentation below, we will break up the error validations from the warning validations.

## Swagger 1.2

For Swagger 1.2, a Swagger API is treated as a [Resource Listing][resource-listing] and at least one
[API Declaration][api-declaration].  If you are not interested in validating the API as a whole, you might not need
some of the validations performed.

### Semantic Error Validations

#### Child Model Redeclares Parent Model Property

Whenever a child Model declares a property that was already defined in one of its ancestors.

#### Circular Model Inheritance

Whenever a Model's lineage results in a circular reference.

#### Default Value Fails Schema Validation

Whenever an Operation, Parameter or Model Property's `defaultValue` fails schema validation.  _(We have to do this
manually since Swagger 1.2 types are not JSON Schema types and the JSON Schema validator does not handle these
situations for us.)_

#### Duplicate API Path in Resource Listing

Whenever multiple APIs in the Resource Listing have the same `path` value.

#### Duplicate API Path in API Declaration

Whenever you have multiple API paths in your API Declaration(s) that have the same `path` value.  _(This check catches
paths that are identically the same and those that are equivalently the same.  For example, `/pets/{id}` and
`/pets/{petId}` are not identically the same but they are equivalently the same.)_

#### Duplicate Operation Response Messages Code

Whenver you have the same `code` value in an Operation's `responseMessages` array.

#### Duplicate Operation Method

Whenever an API has multiple Operations that have the same `method` value.

#### Duplicate Operation Parameter

Whenever an API Operation has multiple parameters that share the same `name`+`type` combination.

#### Duplicate Resource Path in API Declarations

Whenever you have you have multiple API Delcarations as part of the same API with the same `resourcePath` value.

#### Invalid Array Structures

Whenever you have an object of type `array`, it is required that the object have an `items` property.  _(The JSON
Schema files for Swagger 1.2 do not catch this and we have to do it manually.
[swagger-spec/issues/174](https://github.com/swagger-api/swagger-spec/issues/174))_

#### Missing Operation Path Parameter

Whenever you have an API `path` with a path parameter but do not define a corresponding Operation parameter.  _(For
example, you have an API `path` of `/pets/{id}` but do not have an Operation parameter of type `path` with name of
`id`.)_

#### Missing Required Model Property

Whenever you have a required Model property but do not define it in the `properties` object.  _(Since Swagger models
are composed, we have to create the composed object model and then do the validation.  Otherwise we could rely on
JSON Schema to do this.)_

#### Model ID Mismatch

Whenever you define a Model, its `id` is the key name in the `models` part of the API Declaration.  But each Model
also can have an `id` property and they should be equal.

#### Multiple Model Inheritance

Whenever you have a Model that is a `subType` of more than one Model.

#### Unresolvable Operation Path Parameter

Whenever you define an Operation parameter of type `path` and its `name` does not correspond with a named parameter
in the API `path` pattern value.  _(For example, you have an API `path` of `/pets/{id}` but have an Operation parameter
of type `path` with its `name` not equal to `id`.  Or if you define an Operation parameter of type `path` but the
API's `path` does not have any path parameters.)_

#### Unresolvable Operation Response Message Response Model

Whenever your Operation's `responseMessage`'s `responseModel` does not correspond to a defined model.  _(This is the
same as `Unresolvable Model` but ensuring it works for the Operation's `responseMessage`'s `responseModel`.)_

### Semantic Warning Validations

#### Duplicate Authorization Scope Definition

Whenever you have multiple scopes in a single `oauth2` authorization definition that have the same `scope` value.

#### Duplicate Authorization Scope Reference

Whenever you have multiple scopes in a single `oauth2` authorization reference that have the same `scope` value.

#### Unresolvable Model

Whenever you reference a Model by its id and there is no Model defined with said id.

#### Unresolvable Resource Path

Whenever you describe an API `path` in the Resource Declaration but there is no matching API Declaration with the same
`resourcePath` value.

#### Unused API Path in Resource Listing

Whenever an API in the Resource Listing has a path that does not correspond to a provided API Declaration.

#### Unused Authorization Definition

Whenever you define an Authorization in the Resource Listing but no API Declaration Operations use the Authorization.

#### Unused Authorization Scope Definition

Whenever you define an `oauth2` Authorization in the Resource Listing but no API Declaration Operations use one of its
scopes.

#### Unused Model Definition

Whenever you define a Model but there are no references to it.

[api-declaration]: https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md#52-api-declaration
[json-schema]: http://json-schema.org/
[resource-listing]: https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md#51-resource-listing
