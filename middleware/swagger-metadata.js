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

var _ = require('lodash-compat');
var async = require('async');
var bp = require('body-parser');
var cHelpers = require('../lib/helpers');
var debug = require('debug')('swagger-tools:middleware:metadata');
var mHelpers = require('./helpers');
var multer = require('multer');
var parseurl = require('parseurl');
var pathToRegexp = require('path-to-regexp');

// Upstream middlewares
var bodyParserOptions = {
  extended: false
};
var multerOptions = {
  storage: multer.memoryStorage()
};
var textBodyParserOptions = {
  type: '*/*'
};

var jsonBodyParser = bp.json();
var parseQueryString = mHelpers.parseQueryString;
var queryParser = function (req, res, next) {
  if (_.isUndefined(req.query)) {
    req.query = parseQueryString(req);
  }

  return next();
};
var realTextBodyParser = bp.text(textBodyParserOptions);
var textBodyParser = function (req, res, next) {
  if (_.isUndefined(req.body)) {
    realTextBodyParser(req, res, next);
  } else {
    next();
  }
};
var urlEncodedBodyParser = bp.urlencoded(bodyParserOptions);
var bodyParser = function (req, res, next) {
  if (_.isUndefined(req.body)) {
    urlEncodedBodyParser(req, res, function (err) {
      if (err) {
        next(err);
      } else {
        jsonBodyParser(req, res, next);
      }
    });
  } else {
    next();
  }
};
var realMultiPartParser = multer(multerOptions);
var makeMultiPartParser = function (parser) {
  return function (req, res, next) {
    if (_.isUndefined(req.files)) {
      parser(req, res, next);
    } else {
      next();
    }
  };
};

// Helper functions
var expressStylePath = function (basePath, apiPath) {
  basePath = parseurl({url: basePath || '/'}).pathname || '/';

  // Make sure the base path starts with '/'
  if (basePath.charAt(0) !== '/') {
    basePath = '/' + basePath;
  }

  // Make sure the base path ends with '/'
  if (basePath.charAt(basePath.length - 1) !== '/') {
    basePath = basePath + '/';
  }

  // Make sure the api path does not start with '/' since the base path will end with '/'
  if (apiPath.charAt(0) === '/') {
    apiPath = apiPath.substring(1);
  }

  // Replace Swagger syntax for path parameters with Express' version (All Swagger path parameters are required)
  return (basePath + apiPath).replace(/{/g, ':').replace(/}/g, '');
};

var convertValue = function (value, schema, type) {
  var original = value;

  // Default to {}
  if (_.isUndefined(schema)) {
    schema = {};
  }

  // Try to find the type or default to 'object'
  if (_.isUndefined(type)) {
    type = mHelpers.getParameterType(schema);
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
        value = value.split(',');
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

    value = _.map(value, function (item, index) {
      return convertValue(item, _.isArray(schema.items) ? schema.items[index] : schema.items);
    });

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

  case 'string':
    if (['date', 'date-time'].indexOf(schema.format) > -1 && !_.isDate(value)) {
      value = new Date(value);

      if (!_.isDate(value) || value.toString() === 'Invalid Date') {
        value = original;
      }
    }

    break;

  }

  return value;
};

var processOperationParameters = function (swaggerMetadata, pathKeys, pathMatch, req, res, next) {
  var version = swaggerMetadata.swaggerVersion;
  var spec = cHelpers.getSpec(cHelpers.getSwaggerVersion(version === '1.2' ?
                                                         swaggerMetadata.resourceListing :
                                                         swaggerMetadata.swaggerObject), true);
  var parameters = !_.isUndefined(swaggerMetadata) ?
                     (version === '1.2' ? swaggerMetadata.operation.parameters : swaggerMetadata.operationParameters) :
                     undefined;

  if (!parameters) {
    return next();
  }

  debug('  Processing Parameters');

  var parsers = _.reduce(parameters, function (requestParsers, parameter) {
    var contentType = req.headers['content-type'];
    var paramLocation = version === '1.2' ? parameter.paramType : parameter.schema.in;
    var paramType = mHelpers.getParameterType(version === '1.2' ? parameter : parameter.schema);
    var parsableBody = mHelpers.isModelType(spec, paramType) || ['array', 'object'].indexOf(paramType) > -1;
    var parser;

    switch (paramLocation) {
      case 'body':
      case 'form':
      case 'formData':
        if (paramType.toLowerCase() === 'file' || (contentType && contentType.split(';')[0] === 'multipart/form-data')) {
          // Do not add a parser, multipart will be handled after
          break;
        } else if (paramLocation !== 'body' || parsableBody) {
          parser = bodyParser;
        } else {
          parser = textBodyParser;
        }

        break;

      case 'query':
        parser = queryParser;

        break;
    }

    if (parser && requestParsers.indexOf(parser) === -1) {
      requestParsers.push(parser);
    }

    return requestParsers;
  }, []);

  // Multipart is handled by multer, which needs an array of {parameterName, maxCount}
  var multiPartFields = _.reduce(parameters, function (fields, parameter) {
    var paramLocation = version === '1.2' ? parameter.paramType : parameter.schema.in;
    var paramType = mHelpers.getParameterType(version === '1.2' ? parameter : parameter.schema);
    var paramName = version === '1.2' ? parameter.name : parameter.schema.name;

    switch (paramLocation) {
      case 'body':
      case 'form':
      case 'formData':
        if (paramType.toLowerCase() === 'file') {
          // Swagger spec does not allow array of files, so maxCount should be 1
          fields.push({name: paramName, maxCount: 1});
        }
        break;
    }

    return fields;
  }, []);
  
  var contentType = req.headers['content-type'];
  if (multiPartFields.length) {
    // If there are files, use multer#fields
    parsers.push(makeMultiPartParser(realMultiPartParser.fields(multiPartFields)));
  } else if (contentType && contentType.split(';')[0] === 'multipart/form-data') {
    // If no files but multipart form, use empty multer#array for text fields
    parsers.push(makeMultiPartParser(realMultiPartParser.array()));
  }

  async.map(parsers, function (parser, callback) {
    parser(req, res, callback);
  }, function (err) {
    if (err) {
      return next(err);
    }

    _.each(parameters, function (parameterOrMetadata, index) {
      var parameter = version === '1.2' ? parameterOrMetadata : parameterOrMetadata.schema;
      var pType = mHelpers.getParameterType(parameter);
      var oVal;
      var value;

      debug('    %s', parameter.name);
      debug('      Type: %s%s', pType, !_.isUndefined(parameter.format) ? ' (format: ' + parameter.format + ')': '');

      // Located here to make the debug output pretty
      oVal = mHelpers.getParameterValue(version, parameter, pathKeys, pathMatch, req, debug);
      value = convertValue(oVal, _.isUndefined(parameter.schema) ? parameter : parameter.schema, pType);

      debug('      Value: %s', value);

      swaggerMetadata.params[parameter.name] = {
        path: version === '1.2' ?
                swaggerMetadata.operationPath.concat(['parameters', index.toString()]) :
                parameterOrMetadata.path,
        schema: parameter,
        originalValue: oVal,
        value: value
      };
    });

    return next();
  });
};
var processSwaggerDocuments = function (rlOrSO, apiDeclarations) {
  if (_.isUndefined(rlOrSO)) {
    throw new Error('rlOrSO is required');
  } else if (!_.isPlainObject(rlOrSO)) {
    throw new TypeError('rlOrSO must be an object');
  }

  var spec = cHelpers.getSpec(cHelpers.getSwaggerVersion(rlOrSO), true);
  var apiCache = {};
  var composeParameters = function (apiPath, method, path, operation) {
    var cParams = [];
    var seenParams = [];

    _.each(operation.parameters, function (parameter, index) {
      cParams.push({
        path: apiPath.concat([method, 'parameters', index.toString()]),
        schema: parameter
      });

      seenParams.push(parameter.name + ':' + parameter.in);
    });

    _.each(path.parameters, function (parameter, index) {
      if (seenParams.indexOf(parameter.name + ':' + parameter.in) === -1) {
        cParams.push({
          path: apiPath.concat(['parameters', index.toString()]),
          schema: parameter
        });
      }
    });

    return cParams;
  };
  var createCacheEntry = function (adOrSO, apiOrPath, indexOrName, indent) {
    var apiPath = spec.version === '1.2' ? apiOrPath.path : indexOrName;
    var expressPath = expressStylePath(adOrSO.basePath, spec.version === '1.2' ? apiOrPath.path: indexOrName);
    var keys = [];
    var handleSubPaths = !(rlOrSO.paths && rlOrSO.paths[apiPath]['x-swagger-router-handle-subpaths']);
    var re = pathToRegexp(expressPath, keys, { end: handleSubPaths });
    var cacheKey = re.toString();
    var cacheEntry;

    // This is an absolute path, use it as the cache key
    if (expressPath.indexOf('{') === -1) {
      cacheKey = expressPath;
    }

    debug(new Array(indent + 1).join(' ') + 'Found %s: %s',
          (spec.version === '1.2' ? 'API' : 'Path'),
          apiPath);

    cacheEntry = apiCache[cacheKey] = spec.version === '1.2' ?
      {
        api: apiOrPath,
        apiDeclaration: adOrSO,
        apiIndex: indexOrName,
        keys: keys,
        params: {},
        re: re,
        operations: {},
        resourceListing: rlOrSO
      } :
      {
        apiPath: indexOrName,
        path: apiOrPath,
        keys: keys,
        re: re,
        operations: {},
        swaggerObject: {
          original: rlOrSO,
          resolved: adOrSO
        }
      };

    return cacheEntry;
  };

  debug('  Identified Swagger version: %s', spec.version);

  if (spec.version === '1.2') {
    if (_.isUndefined(apiDeclarations)) {
      throw new Error('apiDeclarations is required');
    } else if (!_.isArray(apiDeclarations)) {
      throw new TypeError('apiDeclarations must be an array');
    }

    debug('  Number of API Declarations: %d', apiDeclarations.length);

    _.each(apiDeclarations, function (apiDeclaration, adIndex) {
      debug('  Processing API Declaration %d', adIndex);

      _.each(apiDeclaration.apis, function (api, apiIndex) {
        var cacheEntry = createCacheEntry(apiDeclaration, api, apiIndex, 4);

        cacheEntry.resourceIndex = adIndex;

        _.each(api.operations, function (operation, operationIndex) {
          cacheEntry.operations[operation.method.toLowerCase()] = {
            operation: operation,
            operationPath: ['apis', apiIndex.toString(), 'operations', operationIndex.toString()],
            operationParameters: operation.parameters
          };
        });
      });
    });
  } else {
    // To avoid running into issues with references throughout the Swagger object we will use the resolved version.
    // Getting the resolved version is an asynchronous process but since initializeMiddleware caches the resolved document
    // this is a synchronous action at this point.
    spec.resolve(rlOrSO, function (err, resolved) {
      // Gather the paths, their path regex patterns and the corresponding operations
      _.each(resolved.paths, function (path, pathName) {
        var cacheEntry = createCacheEntry(resolved, path, pathName, 2);

        _.each(['get', 'put', 'post', 'delete', 'options', 'head', 'patch'], function (method) {
          var operation = path[method];

          if (!_.isUndefined(operation)) {
            cacheEntry.operations[method] = {
              operation: operation,
              operationPath: ['paths', pathName, method],
              // Required since we have to compose parameters based on the operation and the path
              operationParameters: composeParameters(['paths', pathName], method, path, operation)
            };
          }
        });
      });
    });
  }

  return apiCache;
};

/**
 * Middleware for providing Swagger information to downstream middleware and request handlers.  For all requests that
 * match a Swagger path, 'req.swagger' will be provided with pertinent Swagger details.  Since Swagger 1.2 and 2.0
 * differ a bit, the structure of this object will change so please view the documentation below for more details:
 *
 *     https://github.com/apigee-127/swagger-tools/blob/master/docs/Middleware.md#swagger-metadata
 *
 * @param {object} rlOrSO - The Resource Listing (Swagger 1.2) or Swagger Object (Swagger 2.0)
 * @param {object[]} apiDeclarations - The array of API Declarations (Swagger 1.2)
 *
 * @returns the middleware function
 */
exports = module.exports = function (rlOrSO, apiDeclarations) {
  debug('Initializing swagger-metadata middleware');

  var apiCache = processSwaggerDocuments(rlOrSO, apiDeclarations);
  var swaggerVersion = cHelpers.getSwaggerVersion(rlOrSO);

  if (_.isUndefined(rlOrSO)) {
    throw new Error('rlOrSO is required');
  } else if (!_.isPlainObject(rlOrSO)) {
    throw new TypeError('rlOrSO must be an object');
  }

  if (swaggerVersion === '1.2') {
    if (_.isUndefined(apiDeclarations)) {
      throw new Error('apiDeclarations is required');
    } else if (!_.isArray(apiDeclarations)) {
      throw new TypeError('apiDeclarations must be an array');
    }
  }

  return function swaggerMetadata (req, res, next) {
    var method = req.method.toLowerCase();
    var path = parseurl(req).pathname;
    var cacheEntry;
    var match;
    var metadata;

    cacheEntry = apiCache[path] || _.find(apiCache, function (metadata) {
      match = metadata.re.exec(path);
      return _.isArray(match);
    });

    debug('%s %s', req.method, req.url);
    debug('  Is a Swagger path: %s', !_.isUndefined(cacheEntry));

    // Request does not match an API defined in the Swagger document(s)
    if (!cacheEntry) {
      return next();
    }

    metadata = swaggerVersion === '1.2' ?
      {
        api: cacheEntry.api,
        apiDeclaration: cacheEntry.apiDeclaration,
        apiIndex: cacheEntry.apiIndex,
        params: {},
        resourceIndex: cacheEntry.resourceIndex,
        resourceListing: cacheEntry.resourceListing
      } :
    {
      apiPath : cacheEntry.apiPath,
      path: cacheEntry.path,
      params: {},
      swaggerObject: cacheEntry.swaggerObject.resolved
    };

    if (_.isPlainObject(cacheEntry.operations[method])) {
      metadata.operation = cacheEntry.operations[method].operation;
      metadata.operationPath = cacheEntry.operations[method].operationPath;

      if (swaggerVersion === '1.2') {
        metadata.authorizations = metadata.operation.authorizations || cacheEntry.apiDeclaration.authorizations;
      } else {
        metadata.operationParameters = cacheEntry.operations[method].operationParameters;
        metadata.security = metadata.operation.security || metadata.swaggerObject.security || [];
      }
    }

    metadata.swaggerVersion = swaggerVersion;

    req.swagger = metadata;

    debug('  Is a Swagger operation: %s', !_.isUndefined(metadata.operation));

    if (metadata.operation) {
      // Process the operation parameters
      return processOperationParameters(metadata, cacheEntry.keys, match, req, res, next, debug);
    } else {
      return next();
    }
  };
};
