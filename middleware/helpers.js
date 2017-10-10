/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

'use strict';

/* This module contains code that is reused in more than one of the Swagger middlewares */

var _ = require('lodash');
var helpers = require('../lib/helpers');
var validators = require('../lib/validators');
var parseurl = require('parseurl');
var qs = require('qs');

var isModelType = module.exports.isModelType = function (spec, type) {
  return spec.primitives.indexOf(type) === -1;
};

var getParameterType = module.exports.getParameterType = function (schema) {
  var type = schema.type;

  if (!type && schema.schema) {
    type = getParameterType(schema.schema);
  }

  if (!type) {
    type = 'object';
  }

  return type;
};

var isModelParameter = module.exports.isModelParameter = function (version, param) {
  var spec = helpers.getSpec(version);
  var type = getParameterType(param);
  var isModel = false;

  if (type === 'object' || isModelType(spec, type)) {
    isModel = true;
  } else if (type === 'array' && isModelType(spec, param.items ?
                                             param.items.type || param.items.$ref :
                                             undefined)) {
    isModel = true;
  }

  return isModel;
};

module.exports.getParameterValue = function (version, parameter, pathKeys, match, req, debug) {
  var defaultVal = version === '1.2' ? parameter.defaultValue : parameter.default;
  var paramLocation = version === '1.2' ? parameter.paramType : parameter.in;
  var paramType = getParameterType(parameter);
  var val;

  // Get the value to validate based on the operation parameter type
  switch (paramLocation) {
  case 'body':
    val = req.body;

    break;
  case 'form':
  case 'formData':
    if (paramType.toLowerCase() === 'file') {
      if (_.isArray(req.files)) {
        val = _.find(req.files, function (file) {
          return file.fieldname === parameter.name;
        });
      } else if (!_.isUndefined(req.files)) {
        val = req.files[parameter.name] ? req.files[parameter.name] : undefined;
      }

      // Swagger does not allow an array of files
      if (_.isArray(val)) {
        val = val[0];
      }
    } else if (isModelParameter(version, parameter)) {
      val = req.body;
    } else {
      val = req.body[parameter.name];
    }

    break;
  case 'header':
    val = req.headers[parameter.name.toLowerCase()];

    break;
  case 'path':
    _.each(pathKeys, function (key, index) {
      if (key.name === parameter.name) {
        val = decodeURIComponent(match[index + 1]);
      }
    });

    break;
  case 'query':
    val = _.get(req.query, parameter.name);

    break;
  }

  debug('      Value provided: %s', !_.isUndefined(val));

  // Use the default value when necessary
  if (_.isUndefined(val) && !_.isUndefined(defaultVal)) {
    val = defaultVal;
  }

  return val;
};

module.exports.parseQueryString = function(req) {
  return req.url.indexOf('?') > -1 ? qs.parse(parseurl(req).query, {}) : {};
};

module.exports.debugError = function (err, debug) {
  var reason = err.message.replace(/^.*validation failed: /, '');

  reason = reason.charAt(0).toUpperCase() + reason.substring(1);

  debug('  Reason: %s', reason);

  if (err.failedValidation === true) {
    if (err.results) {
      debug('  Errors:');

      _.each(err.results.errors, function (error, index) {
        debug('    %d:', index);
        debug('      code: %s', error.code);
        debug('      message: %s', error.message);
        debug('      path: %s', JSON.stringify(error.path));
      });
    }
  }

  if (err.stack) {
    debug('  Stack:');

    _.each(err.stack.split('\n'), function (line, index) {
      // Skip the first line since it's in the reasonx
      if (index > 0) {
        debug('  %s', line);
      }
    });
  }
};

var convertValue = module.exports.convertValue = function (value, schema, type, location) {
  var original = value;

  // Default to {}
  if (_.isUndefined(schema)) {
    schema = {};
  }

  // Try to find the type or default to 'object'
  if (_.isUndefined(type)) {
    type = getParameterType(schema);
  }

  // If there is no value, do not convert it
  if (_.isUndefined(value)) {
    return value;
  }

  // If there is an empty value and allowEmptyValue is true, return it
  if (schema.allowEmptyValue && value === '') {
    return value;
  }

  switch (type) {
  case 'array':
    if (_.isString(value)) {
      switch (schema.collectionFormat) {
      case 'csv':
      case undefined:
        try {
          value = JSON.parse(value);
        } catch (err) {
          value = original;
        }

        if (_.isString(value)) {
          value = value.split(',');
        }
        break;
      case 'multi':
        value = [value];
        break;
      case 'pipes':
        value = value.split('|');
        break;
      case 'ssv':
        value = value.split(' ');
        break;
      case 'tsv':
        value = value.split('\t');
        break;
      }
    }

    // Handle situation where the expected type is array but only one value was provided
    if (!_.isArray(value)) {
      // Do not convert non-Array items to single item arrays if the location is 'body' (Issue #438)
      if (location !== 'body') {
        value = [value];
      }
    }

    if (_.isArray(value)) {
      value = _.map(value, function (item, index) {
        var iSchema = _.isArray(schema.items) ? schema.items[index] : schema.items;

        return convertValue(item, iSchema, iSchema ? iSchema.type : undefined, location);
      });
    }

    break;

  case 'boolean':
    if (!_.isBoolean(value)) {
      if (['false', 'true'].indexOf(value) === -1) {
        value = original;
      } else {
        value = value === 'true' || value === true ? true : false;
      }
    }

    break;

  case 'integer':
    if (!_.isNumber(value)) {
      if (_.isString(value) && _.trim(value).length === 0) {
        value = NaN;
      }

      value = Number(value);

      if (isNaN(value)) {
        value = original;
      }
    }

    break;

  case 'number':
    if (!_.isNumber(value)) {
      if (_.isString(value) && _.trim(value).length === 0) {
        value = NaN;
      }

      value = Number(value);

      if (isNaN(value)) {
        value = original;
      }
    }

    break;

  case 'object':
    if (_.isString(value)) {
      try {
        value = JSON.parse(value);
      } catch (err) {
        value = original;
      }
    }

    break;

  case 'string':
    if(!_.isDate(value)) {
      var isDate = schema.format === 'date' && validators.isValidDate(value);
      var isDateTime = schema.format === 'date-time' && validators.isValidDateTime(value);
      if (isDate || isDateTime) {
        value = new Date(value);
    
        if (!_.isDate(value) || value.toString() === 'Invalid Date') {
          value = original;
        }
      }
    }

    break;

  }

  return value;
};
