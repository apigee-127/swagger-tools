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

var _ = require('lodash-compat');
var helpers = require('../lib/helpers');
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
