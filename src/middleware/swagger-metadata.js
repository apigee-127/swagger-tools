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

const _ = require('lodash');
const async = require('async');
const bp = require('body-parser');
const debug = require('debug')('swagger-tools:middleware:metadata');
const multer = require('multer');
const parseurl = require('parseurl');
const pathToRegexp = require('path-to-regexp');

const mHelpers = require('./helpers');
const cHelpers = require('../lib/helpers');

// Upstream middlewares
const bodyParserOptions = {
  extended: false,
};
const multerOptions = {
  storage: multer.memoryStorage(),
};
const textBodyParserOptions = {
  type: '*/*',
};

const jsonBodyParser = bp.json();
const { parseQueryString } = mHelpers;
const queryParser = (req, res, next) => {
  if (_.isUndefined(req.query)) {
    req.query = parseQueryString(req);
  }

  return next();
};
const realTextBodyParser = bp.text(textBodyParserOptions);
const textBodyParser = (req, res, next) => {
  if (_.isUndefined(req.body)) {
    realTextBodyParser(req, res, next);
  } else {
    next();
  }
};
const urlEncodedBodyParser = bp.urlencoded(bodyParserOptions);
const bodyParser = (req, res, next) => {
  if (_.isUndefined(req.body)) {
    urlEncodedBodyParser(req, res, err => {
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
const realMultiPartParser = multer(multerOptions);
const makeMultiPartParser = parser => {
  return (req, res, next) => {
    if (_.isUndefined(req.files)) {
      parser(req, res, next);
    } else {
      next();
    }
  };
};

// Helper functions
const expressStylePath = (origBasePath, origApiPath) => {
  let basePath = origBasePath;
  let apiPath = origApiPath;

  basePath = parseurl({ url: basePath || '/' }).pathname || '/';

  // Make sure the base path starts with '/'
  if (basePath.charAt(0) !== '/') {
    basePath = `/${basePath}`;
  }

  // Make sure the base path ends with '/'
  if (basePath.charAt(basePath.length - 1) !== '/') {
    basePath += '/';
  }

  // Make sure the api path does not start with '/' since the base path will end with '/'
  if (apiPath.charAt(0) === '/') {
    apiPath = apiPath.substring(1);
  }

  // Replace Swagger syntax for path parameters with Express' version (All Swagger path parameters are required)
  return (basePath + apiPath).replace(/{/g, ':').replace(/}/g, '');
};

const processOperationParameters = (
  origSwaggerMetadata,
  pathKeys,
  pathMatch,
  req,
  res,
  next,
) => {
  const swaggerMetadata = origSwaggerMetadata;
  const version = swaggerMetadata.swaggerVersion;
  const spec = cHelpers.getSpec(
    cHelpers.getSwaggerVersion(
      version === '1.2'
        ? swaggerMetadata.resourceListing
        : swaggerMetadata.swaggerObject,
    ),
    true,
  );
  const opParms =
    version === '1.2'
      ? swaggerMetadata.operation.parameters
      : swaggerMetadata.operationParameters;
  const parameters = !_.isUndefined(swaggerMetadata) ? opParms : undefined;

  if (!parameters) {
    return next();
  }

  debug('  Processing Parameters');

  const parsers = _.reduce(
    parameters,
    (requestParsers, parameter) => {
      const contentType = req.headers['content-type'];
      const paramLocation =
        version === '1.2' ? parameter.paramType : parameter.schema.in;
      const paramType = mHelpers.getParameterType(
        version === '1.2' ? parameter : parameter.schema,
      );
      const parsableBody =
        mHelpers.isModelType(spec, paramType) ||
        ['array', 'object'].indexOf(paramType) > -1;
      let parser;

      // eslint-disable-next-line default-case
      switch (paramLocation) {
        case 'body':
        case 'form':
        case 'formData':
          if (
            paramType.toLowerCase() === 'file' ||
            (contentType && contentType.split(';')[0] === 'multipart/form-data')
          ) {
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
    },
    [],
  );

  // Multipart is handled by multer, which needs an array of {parameterName, maxCount}
  const multiPartFields = _.reduce(
    parameters,
    (fields, parameter) => {
      const paramLocation =
        version === '1.2' ? parameter.paramType : parameter.schema.in;
      const paramType = mHelpers.getParameterType(
        version === '1.2' ? parameter : parameter.schema,
      );
      const paramName =
        version === '1.2' ? parameter.name : parameter.schema.name;

      // eslint-disable-next-line default-case
      switch (paramLocation) {
        case 'body':
        case 'form':
        case 'formData':
          if (paramType.toLowerCase() === 'file') {
            // Swagger spec does not allow array of files, so maxCount should be 1
            fields.push({ name: paramName, maxCount: 1 });
          }
          break;
      }

      return fields;
    },
    [],
  );

  const contentType = req.headers['content-type'];
  if (multiPartFields.length) {
    // If there are files, use multer#fields
    parsers.push(
      makeMultiPartParser(realMultiPartParser.fields(multiPartFields)),
    );
  } else if (
    contentType &&
    contentType.split(';')[0] === 'multipart/form-data'
  ) {
    // If no files but multipart form, use empty multer#array for text fields
    parsers.push(makeMultiPartParser(realMultiPartParser.array()));
  }

  return async.map(
    parsers,
    (parser, callback) => {
      parser(req, res, callback);
    },
    err => {
      if (err) {
        return next(err);
      }

      _.each(parameters, (parameterOrMetadata, index) => {
        const parameter =
          version === '1.2' ? parameterOrMetadata : parameterOrMetadata.schema;
        const pLocation =
          version === '1.2' ? parameter.paramType : parameter.in;
        const pType = mHelpers.getParameterType(parameter);

        debug('    %s', parameter.name);
        debug(
          '      Type: %s%s',
          pType,
          !_.isUndefined(parameter.format)
            ? ` (format: ${parameter.format})`
            : '',
        );

        // Located here to make the debug output pretty
        const oVal = mHelpers.getParameterValue(
          version,
          parameter,
          pathKeys,
          pathMatch,
          req,
          debug,
        );
        const value = mHelpers.convertValue(
          oVal,
          _.isUndefined(parameter.schema) ? parameter : parameter.schema,
          pType,
          pLocation,
        );

        debug('      Value: %s', value);

        swaggerMetadata.params[parameter.name] = {
          path:
            version === '1.2'
              ? swaggerMetadata.operationPath.concat([
                  'parameters',
                  index.toString(),
                ])
              : parameterOrMetadata.path,
          schema: parameter,
          originalValue: oVal,
          value,
        };
      });

      return next();
    },
  );
};

const processSwaggerDocuments = (rlOrSO, apiDeclarations) => {
  if (_.isUndefined(rlOrSO)) {
    throw new Error('rlOrSO is required');
  } else if (!_.isPlainObject(rlOrSO)) {
    throw new TypeError('rlOrSO must be an object');
  }

  const spec = cHelpers.getSpec(cHelpers.getSwaggerVersion(rlOrSO), true);
  const apiCache = {};
  const composeParameters = (apiPath, method, path, operation) => {
    const cParams = [];
    const seenParams = [];

    _.each(operation.parameters, (parameter, index) => {
      cParams.push({
        path: apiPath.concat([method, 'parameters', index.toString()]),
        schema: parameter,
      });

      seenParams.push(`${parameter.name}:${parameter.in}`);
    });

    _.each(path.parameters, (parameter, index) => {
      if (seenParams.indexOf(`${parameter.name}:${parameter.in}`) === -1) {
        cParams.push({
          path: apiPath.concat(['parameters', index.toString()]),
          schema: parameter,
        });
      }
    });

    return cParams;
  };

  const createCacheEntry = (adOrSO, apiOrPath, indexOrName, indent) => {
    const apiPath = spec.version === '1.2' ? apiOrPath.path : indexOrName;
    const expressPath = expressStylePath(
      adOrSO.basePath,
      spec.version === '1.2' ? apiOrPath.path : indexOrName,
    );
    const keys = [];
    const handleSubPaths = !(
      rlOrSO.paths && rlOrSO.paths[apiPath]['x-swagger-router-handle-subpaths']
    );
    const re = pathToRegexp(expressPath, keys, { end: handleSubPaths });
    let cacheKey = re.toString();

    // This is an absolute path, use it as the cache key
    if (expressPath.indexOf('{') === -1) {
      cacheKey = expressPath;
    }

    debug(
      `${new Array(indent + 1).join(' ')}Found %s: %s`,
      spec.version === '1.2' ? 'API' : 'Path',
      apiPath,
    );

    apiCache[cacheKey] =
      spec.version === '1.2'
        ? {
            api: apiOrPath,
            apiDeclaration: adOrSO,
            apiIndex: indexOrName,
            keys,
            params: {},
            re,
            operations: {},
            resourceListing: rlOrSO,
          }
        : {
            apiPath: indexOrName,
            path: apiOrPath,
            keys,
            re,
            operations: {},
            swaggerObject: {
              original: rlOrSO,
              resolved: adOrSO,
            },
          };

    const cacheEntry = apiCache[cacheKey];

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

    _.each(apiDeclarations, (apiDeclaration, adIndex) => {
      debug('  Processing API Declaration %d', adIndex);

      _.each(apiDeclaration.apis, (api, apiIndex) => {
        const cacheEntry = createCacheEntry(apiDeclaration, api, apiIndex, 4);

        cacheEntry.resourceIndex = adIndex;

        _.each(api.operations, (operation, operationIndex) => {
          cacheEntry.operations[operation.method.toLowerCase()] = {
            operation,
            operationPath: [
              'apis',
              apiIndex.toString(),
              'operations',
              operationIndex.toString(),
            ],
            operationParameters: operation.parameters,
          };
        });
      });
    });
  } else {
    // To avoid running into issues with references throughout the Swagger object we will use the resolved version.
    // Getting the resolved version is an asynchronous process but since initializeMiddleware caches the resolved document
    // this is a synchronous action at this point.
    spec.resolve(rlOrSO, (err, resolved) => {
      // Gather the paths, their path regex patterns and the corresponding operations
      _.each(resolved.paths, (path, pathName) => {
        const cacheEntry = createCacheEntry(resolved, path, pathName, 2);

        _.each(
          ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'],
          method => {
            const operation = path[method];

            if (!_.isUndefined(operation)) {
              cacheEntry.operations[method] = {
                operation,
                operationPath: ['paths', pathName, method],
                // Required since we have to compose parameters based on the operation and the path
                operationParameters: composeParameters(
                  ['paths', pathName],
                  method,
                  path,
                  operation,
                ),
              };
            }
          },
        );
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
function swaggerMetadataMiddleware(rlOrSO, apiDeclarations) {
  debug('Initializing swagger-metadata middleware');

  const apiCache = processSwaggerDocuments(rlOrSO, apiDeclarations);
  const swaggerVersion = cHelpers.getSwaggerVersion(rlOrSO);

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

  return function swaggerMetadata(req, res, next) {
    const method = req.method.toLowerCase();
    const path = parseurl(req).pathname;
    let match;

    const cacheEntry =
      apiCache[path] ||
      _.find(apiCache, apiCacheMetadata => {
        match = apiCacheMetadata.re.exec(path);
        return _.isArray(match);
      });

    debug('%s %s', req.method, req.url);
    debug('  Is a Swagger path: %s', !_.isUndefined(cacheEntry));

    // Request does not match an API defined in the Swagger document(s)
    if (!cacheEntry) {
      return next();
    }

    const metadata =
      swaggerVersion === '1.2'
        ? {
            api: cacheEntry.api,
            apiDeclaration: cacheEntry.apiDeclaration,
            apiIndex: cacheEntry.apiIndex,
            params: {},
            resourceIndex: cacheEntry.resourceIndex,
            resourceListing: cacheEntry.resourceListing,
          }
        : {
            apiPath: cacheEntry.apiPath,
            path: cacheEntry.path,
            params: {},
            swaggerObject: cacheEntry.swaggerObject.resolved,
          };

    if (_.isPlainObject(cacheEntry.operations[method])) {
      metadata.operation = cacheEntry.operations[method].operation;
      metadata.operationPath = cacheEntry.operations[method].operationPath;

      if (swaggerVersion === '1.2') {
        metadata.authorizations =
          metadata.operation.authorizations ||
          cacheEntry.apiDeclaration.authorizations;
      } else {
        metadata.operationParameters =
          cacheEntry.operations[method].operationParameters;
        metadata.security =
          metadata.operation.security || metadata.swaggerObject.security || [];
      }
    }

    metadata.swaggerVersion = swaggerVersion;

    req.swagger = metadata;

    debug('  Is a Swagger operation: %s', !_.isUndefined(metadata.operation));

    if (metadata.operation) {
      // Process the operation parameters
      return processOperationParameters(
        metadata,
        cacheEntry.keys,
        match,
        req,
        res,
        next,
        debug,
      );
    }
    return next();
  };
}

module.exports = swaggerMetadataMiddleware;
exports = module.exports;
