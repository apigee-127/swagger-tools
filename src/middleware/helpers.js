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

/* This module contains code that is reused in more than one of the Swagger middlewares */

const _ = require('lodash');
const parseurl = require('parseurl');
const qs = require('qs');
const helpers = require('../lib/helpers');
const validators = require('../lib/validators');

const isModelType = (spec, type) => {
  return spec.primitives.indexOf(type) === -1;
};

const getParameterType = schema => {
  let { type } = schema;

  if (!type && schema.schema) {
    type = getParameterType(schema.schema);
  }

  if (!type) {
    type = 'object';
  }

  return type;
};

const isModelParameter = (version, param) => {
  const spec = helpers.getSpec(version);
  const type = getParameterType(param);
  let isModel = false;

  if (type === 'object' || isModelType(spec, type)) {
    isModel = true;
  } else if (
    type === 'array' &&
    isModelType(
      spec,
      param.items ? param.items.type || param.items.$ref : undefined,
    )
  ) {
    isModel = true;
  }

  return isModel;
};

const getParameterValue = (version, parameter, pathKeys, match, req, debug) => {
  const defaultVal =
    version === '1.2' ? parameter.defaultValue : parameter.default;
  const paramLocation = version === '1.2' ? parameter.paramType : parameter.in;
  const paramType = getParameterType(parameter);
  let val;

  // Get the value to validate based on the operation parameter type
  // eslint-disable-next-line default-case
  switch (paramLocation) {
    case 'body':
      val = req.body;

      break;
    case 'form':
    case 'formData':
      if (paramType.toLowerCase() === 'file') {
        if (_.isArray(req.files)) {
          val = _.find(req.files, file => {
            return file.fieldname === parameter.name;
          });
        } else if (!_.isUndefined(req.files)) {
          val = req.files[parameter.name]
            ? req.files[parameter.name]
            : undefined;
        }

        // Swagger does not allow an array of files
        if (_.isArray(val)) {
          [val] = val;
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
      _.each(pathKeys, (key, index) => {
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

const parseQueryString = req => {
  return req.url.indexOf('?') > -1 ? qs.parse(parseurl(req).query, {}) : {};
};

const debugError = (err, debug) => {
  let reason = err.message.replace(/^.*validation failed: /, '');

  reason = reason.charAt(0).toUpperCase() + reason.substring(1);

  debug('  Reason: %s', reason);

  if (err.failedValidation === true) {
    if (err.results) {
      debug('  Errors:');

      _.each(err.results.errors, (error, index) => {
        debug('    %d:', index);
        debug('      code: %s', error.code);
        debug('      message: %s', error.message);
        debug('      path: %s', JSON.stringify(error.path));
      });
    }
  }

  if (err.stack) {
    debug('  Stack:');

    _.each(err.stack.split('\n'), (line, index) => {
      // Skip the first line since it's in the reasonx
      if (index > 0) {
        debug('  %s', line);
      }
    });
  }
};

const convertValue = function(origValue, origSchema, origType, location) {
  let value = origValue;
  let schema = origSchema;
  let type = origType;
  const original = value;

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

  // eslint-disable-next-line default-case
  switch (type) {
    case 'array':
      if (_.isString(value)) {
        // eslint-disable-next-line default-case
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
        value = _.map(value, (item, index) => {
          const iSchema = _.isArray(schema.items)
            ? schema.items[index]
            : schema.items;

          return convertValue(
            item,
            iSchema,
            iSchema ? iSchema.type : undefined,
            location,
          );
        });
      }

      break;

    case 'boolean':
      if (!_.isBoolean(value)) {
        if (['false', 'true'].indexOf(value) === -1) {
          value = original;
        } else {
          value = !!(value === 'true' || value === true);
        }
      }

      break;

    case 'integer':
      if (!_.isNumber(value)) {
        if (_.isString(value) && _.trim(value).length === 0) {
          value = NaN;
        }

        value = Number(value);

        if (Number.isNaN(value)) {
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

        if (Number.isNaN(value)) {
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
      if (!_.isDate(value)) {
        const isDate =
          schema.format === 'date' && validators.isValidDate(value);
        const isDateTime =
          schema.format === 'date-time' && validators.isValidDateTime(value);
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

module.exports = {
  isModelType,
  getParameterType,
  isModelParameter,
  getParameterValue,
  parseQueryString,
  debugError,
  convertValue,
};
