/*
 * Copyright 2014 Apigee Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// Module dependencies
var _ = require('lodash');
var fs = require('fs');
var jjv = require('jjv');
var jjve = require('jjve');

var validatorDefaults = {
  useDefault: false,
  useCoerce: false,
  checkRequired: true,
  removeAdditional: false
};

var throwUnsupportedVersion = function (version) {
  throw new Error(version + ' is an unsupported Swagger specification version');
};

/**
 * Creates a new Swagger specification object.
 *
 * @param {string} version - The Swagger version
 * @param {object} [options] - The specification options (Currently used to pass validator options)
 * @param {boolean} [options.useDefault=false] - If true it modifies the object to have the default values for missing
 *                                               non-required fields
 * @param {boolean} [options.useCoerce=false] - If true it enables type coercion where defined
 * @param {boolean} [options.checkRequired=true] - If true it reports missing required properties, otherwise it allows
 *                                                 missing required properties
 * @param {boolean} [options.removeAdditional=false] - If true it removes all attributes of an object which are not
 *                                                     matched by the schema's specification
 * @constructor
 */
var Specification = function Specification (version, options) {
  var docsUrl;
  var schemasUrl;

  options = _.defaults(options || {}, validatorDefaults);

  switch (version) {
  case '1.2':
    docsUrl = 'https://github.com/wordnik/swagger-spec/blob/master/versions/1.2.md';
    schemasUrl = 'https://github.com/wordnik/swagger-spec/tree/master/schemas/v1.2';

    break;
  default:
    throwUnsupportedVersion(version);
  }

  this.docsUrl = docsUrl;
  this.options = options;
  this.schemasUrl = schemasUrl;
  this.version = version;

  // Load the schema files
  this.schemas = {};

  fs.readdirSync('./schemas/' + version)
    .filter(function (name) {
      return name.match(/^(.*)\.json$/);
    })
    .forEach(function (name) {
      this.schemas[name] = require('./schemas/' + version + '/' + name);
    }.bind(this));

  // Create the validators
  this.validators = {};

  switch (version) {
  case '1.2':
    Object.keys(this.schemas).forEach(function (schemaName) {
      var validator = jjv();
      var toCompile = [];

      // Disable the 'uri' format checker as it's got issues: https://github.com/acornejo/jjv/issues/24
      validator.addFormat('uri', function() {
        return true;
      });

      // Since some schemas depend on others, bring them in appropriately
      switch (schemaName) {
      case 'apiDeclaration.json':
        toCompile = [
          'dataTypeBase.json',
          'modelsObject.json',
          'oauth2GrantType.json',
          'authorizationObject.json',
          'parameterObject.json',
          'operationObject.json'
        ];

        break;
      case 'authorizationObject.json':
        toCompile.push('oauth2GrantType.json');

        break;
      case 'modelsObject.json':
        toCompile.push('dataTypeBase.json');

        break;
      case 'operationObject.json':
        toCompile = [
          'dataTypeBase.json',
          'authorizationObject.json',
          'oauth2GrantType.json',
          'parameterObject.json'
        ];

        break;

      case 'parameterObject.json':
        toCompile.push('dataTypeBase.json');

        break;

      case 'resourceListing.json':
        toCompile = [
          'resourceObject.json',
          'infoObject.json',
          'oauth2GrantType.json',
          'authorizationObject.json'
        ];

        break;
      }

      toCompile.push(schemaName);

      toCompile.forEach(function (schemaName) {
        this.schemas[schemaName].id = schemaName;

        validator.addSchema(schemaName, this.schemas[schemaName]);
      }.bind(this));

      validator.je = jjve(validator);

      this.validators[schemaName] = validator;
    }.bind(this));

    break;
  }
};

/**
 * Returns the result of the validation of the Swagger document against its schema.
 *
 * @param {object} data - The object representing the Swagger document/fragment
 * @param {string} [schemaName='apiDeclaration.json'] - The schema name to use to validate the document/fragment
 *
 * @returns undefined if validation passes or an array of error objects
 */
Specification.prototype.validate = function (data, schemaName) {
  if (_.isUndefined(data)) {
    throw new Error('data is required');
  } else if (!_.isObject(data)) {
    throw new TypeError('data must be an object');
  }

  var schema;
  var validator;
  var result;

  switch (this.version) {
  case '1.2':
    // Default to 'apiDeclaration.json'
    schemaName = schemaName || 'apiDeclaration.json';

    schema = this.schemas[schemaName];

    break;
  default:
    throwUnsupportedVersion(this.version);
  }

  if (!schema) {
    throw new Error('dataSchema is not valid.  Valid schema names: ' + Object.keys(this.schemas).join(', '));
  }

  validator = this.validators[schemaName];
  result = validator.validate(schema, data);

  if (result) {
    return validator.je(schema, data, result);
  } else {
    return undefined;
  }
};

var v1_2 = module.exports.v1_2 = new Specification('1.2'); // jshint ignore:line
