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
var parseurl = require('parseurl');
var qs = require('qs');

var isModelType = module.exports.isModelType = function isModelType (spec, type) {
  return spec.primitives.indexOf(type) === -1;
};

var isModelParameter = module.exports.isModelParameter = function isModelParameter (version, param) {
  var spec = helpers.getSpec(version);
  var isModel = false;

  switch (version) {
  case '1.2':
    if (!_.isUndefined(param.type) && isModelType(spec, param.type)) {
      isModel = true;
    } else if (param.type === 'array' && isModelType(spec, param.items ?
                                                             param.items.type || param.items.$ref :
                                                             undefined)) {
      isModel = true;
    }

    break;

  case '2.0':
    if (param.type === 'object' || !param.type) {
      isModel = true;
    } else if (!_.isUndefined(param.schema) && (param.schema.type === 'object' || !_.isUndefined(param.schema.$ref))) {
      isModel = true;
    }

    // 2.0 does not allow arrays of models in the same way Swagger 1.2 does

    break;
  }

  return isModel;
};

var getParameterType = module.exports.getParameterType = function getParameterType (schema) {
  var type = schema.type;

  if (!type && schema.schema) {
    type = schema.type;
  }

  if (!type) {
    type = 'object';
  }

  return type;
};

module.exports.getParameterValue = function getParameterValue (version, parameter, pathKeys, match, req, debug) {
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
      val = req.files[parameter.name];
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
        val = match[index + 1];
      }
    });

    break;
  case 'query':
    val = req.query[parameter.name];

    break;
  }

  debug('      Value provided: %s', !_.isUndefined(val));

  // Use the default value when necessary
  if (_.isUndefined(val) && !_.isUndefined(defaultVal)) {
    val = defaultVal;
  }

  return val;
};

module.exports.parseQueryString = function parseQueryString(req) {
  return req.url.indexOf('?') > -1 ? qs.parse(parseurl(req).query, {}) : {};
};

module.exports.debugError = function debugError (err, debug) {
  if (err.failedValidation === true) {
    debug('Failed validation: %s', err.message);
  } else {
    debug('Unexpected error: %s', err.message);
  }

  if (err.stack) {
    _.each(err.stack.split('\n'), function (line) {
      debug('  %s', line);
    });
  }
};
