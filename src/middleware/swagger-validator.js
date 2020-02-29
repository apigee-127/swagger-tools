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
const debug = require('debug')('swagger-tools:middleware:validator');

const cHelpers = require('../lib/helpers');
const mHelpers = require('./helpers');
const validators = require('../lib/validators');

const sendData = (swaggerVersion, res, origData, encoding, skipped) => {
  let data = origData;
  // 'res.end' requires a Buffer or String so if it's not one, create a String
  if (!(data instanceof Buffer) && !_.isString(data)) {
    data = JSON.stringify(data);
  }

  if (skipped) {
    if (_.isUndefined(res.getHeader('content-type'))) {
      // This scenario only happens for a 204/304 response and there is no Content-Type
      debug(
        "    Validation: skipped (Cached response for '%d')",
        res.statusCode,
      );
    } else if (swaggerVersion === '1.2') {
      debug(
        '    Validation: skipped (No responseMessage definition)',
        res.statusCode,
      );
    } else {
      debug('    Validation: skipped (No response definition)', res.statusCode);
    }
  } else {
    debug('    Validation: succeeded');
  }

  res.end(data, encoding);
};

const send400 = (req, res, next, origErr) => {
  const err = origErr;
  let currentMessage;
  let validationMessage;

  res.statusCode = 400;

  // Format the errors to include the parameter information
  if (err.failedValidation === true && err.paramName) {
    currentMessage = err.message;
    validationMessage = `Parameter (${err.paramName}) `;

    switch (err.code) {
      case 'ENUM_MISMATCH':
      case 'MAXIMUM':
      case 'MAXIMUM_EXCLUSIVE':
      case 'MINIMUM':
      case 'MINIMUM_EXCLUSIVE':
      case 'MULTIPLE_OF':
      case 'INVALID_TYPE':
        if (
          err.code === 'INVALID_TYPE' &&
          err.message.split(' ')[0] === 'Value'
        ) {
          validationMessage += err.message
            .split(' ')
            .slice(1)
            .join(' ');
        } else {
          validationMessage += `is ${err.message
            .charAt(0)
            .toLowerCase()}${err.message.substring(1)}`;
        }

        break;

      case 'ARRAY_LENGTH_LONG':
      case 'ARRAY_LENGTH_SHORT':
      case 'MAX_LENGTH':
      case 'MIN_LENGTH':
        validationMessage += err.message
          .split(' ')
          .slice(1)
          .join(' ');

        break;

      case 'MAX_PROPERTIES':
      case 'MIN_PROPERTIES':
        validationMessage += `properties are ${err.message
          .split(' ')
          .slice(4)
          .join(' ')}`;

        break;

      default:
        validationMessage +=
          err.message.charAt(0).toLowerCase() + err.message.substring(1);
    }

    // Replace the message
    err.message = `Request validation failed: ${validationMessage}`;

    // Replace the stack message
    err.stack = err.stack.replace(currentMessage, validationMessage);
  }

  return next(err);
};

const validateValue = (req, schema, path, origVal, location, callback) => {
  let val = origVal;
  const document = req.swagger.apiDeclaration || req.swagger.swaggerObject;
  const version = req.swagger.apiDeclaration ? '1.2' : '2.0';
  const isModel = mHelpers.isModelParameter(version, schema);
  const spec = cHelpers.getSpec(version);

  val = mHelpers.convertValue(
    val,
    schema,
    mHelpers.getParameterType(schema),
    location,
  );

  try {
    validators.validateSchemaConstraints(version, schema, path, val);
  } catch (err) {
    return callback(err);
  }

  if (isModel) {
    if (_.isString(val)) {
      try {
        val = JSON.parse(val);
      } catch (err) {
        err.failedValidation = true;
        err.message = 'Value expected to be an array/object but is not';

        throw err;
      }
    }

    return async.map(
      schema.type === 'array' ? val : [val],
      (aVal, oCallback) => {
        if (version === '1.2') {
          spec.validateModel(
            document,
            `#/models/${
              schema.items
                ? schema.items.type || schema.items.$ref
                : schema.type
            }`,
            aVal,
            oCallback,
          );
        } else {
          try {
            validators.validateAgainstSchema(
              schema.schema ? schema.schema : schema,
              val,
            );

            oCallback();
          } catch (err) {
            oCallback(err);
          }
        }
      },
      (origAsyncErr, allResults) => {
        let asyncErr = origAsyncErr;
        if (!asyncErr) {
          _.each(allResults, results => {
            if (results && cHelpers.getErrorCount(results) > 0) {
              asyncErr = new Error('Failed schema validation');

              asyncErr.code = 'SCHEMA_VALIDATION_FAILED';
              asyncErr.errors = results.errors;
              asyncErr.warnings = results.warnings;
              asyncErr.failedValidation = true;

              return false;
            }
            return undefined;
          });
        }

        return callback(asyncErr);
      },
    );
  }

  return callback();
};

const wrapEnd = (req, res, next) => {
  const { operation } = req.swagger;
  const originalEnd = res.end;
  const vPath = _.cloneDeep(req.swagger.operationPath);
  const { swaggerVersion } = req.swagger;

  const writtenData = [];

  const originalWrite = res.write;
  res.write = data => {
    if (typeof data !== 'undefined') {
      writtenData.push(data);
    }
    // Don't call the originalWrite. We want to validate the data before writing
    // it to our response.
  };

  res.end = (data, encoding) => {
    let schema = operation;
    let val;
    if (data) {
      if (data instanceof Buffer) {
        writtenData.push(data);
        val = Buffer.concat(writtenData);
      } else if (data instanceof String) {
        writtenData.push(Buffer.from(data));
        val = Buffer.concat(writtenData);
      } else {
        val = data;
      }
    } else if (writtenData.length !== 0) {
      val = Buffer.concat(writtenData);
    }

    let responseCode;

    // Replace 'res.end' and 'res.write' with the originals
    res.write = originalWrite;
    res.end = originalEnd;

    debug('  Response validation:');

    // If the data is a buffer, convert it to a string so we can parse it prior to validation
    if (val instanceof Buffer) {
      val = val.toString(encoding);
    }

    // Express removes the Content-Type header from 204/304 responses which makes response validation impossible
    if (
      _.isUndefined(res.getHeader('content-type')) &&
      [204, 304].indexOf(res.statusCode) > -1
    ) {
      sendData(swaggerVersion, res, val, encoding, true);
      return; // do NOT call next() here, doing so would execute remaining middleware chain twice
    }

    try {
      // Validate the content type
      try {
        validators.validateContentType(
          req.swagger.apiDeclaration
            ? req.swagger.apiDeclaration.produces
            : req.swagger.swaggerObject.produces,
          operation.produces,
          res,
        );
      } catch (err) {
        err.failedValidation = true;

        throw err;
      }

      if (_.isUndefined(schema.type)) {
        if (schema.schema) {
          schema = schema.schema;
        } else if (swaggerVersion === '1.2') {
          schema = _.find(
            operation.responseMessages,
            (responseMessage, index) => {
              if (responseMessage.code === res.statusCode) {
                vPath.push('responseMessages', index.toString());

                responseCode = responseMessage.code;

                return true;
              }
              return undefined;
            },
          );

          if (!_.isUndefined(schema)) {
            schema = schema.responseModel;
          }
        } else {
          schema = _.find(operation.responses, (response, code) => {
            if (code === (res.statusCode || 200).toString()) {
              vPath.push('responses', code);

              responseCode = code;

              return true;
            }
            return undefined;
          });

          if (_.isUndefined(schema) && operation.responses.default) {
            responseCode = 'default';
            schema = operation.responses.default;

            vPath.push('responses', 'default');
          }
        }
      }

      debug(
        `    Response ${
          swaggerVersion === '1.2' ? 'message' : 'code'
        }: ${responseCode}`,
      );

      if (_.isUndefined(schema)) {
        sendData(swaggerVersion, res, val, encoding, true);
      } else {
        validateValue(
          req,
          schema,
          vPath,
          val,
          'body',
          function validateValueCallback(err) {
            if (err) {
              throw err;
            }
            sendData(swaggerVersion, res, val, encoding, true);
          },
        );
      }
    } catch (err) {
      if (err.failedValidation) {
        err.originalResponse = data;
        err.message = `Response validation failed: ${err.message
          .charAt(0)
          .toLowerCase()}${err.message.substring(1)}`;

        debug('    Validation: failed');

        mHelpers.debugError(err, debug);
      }

      next(err);
    }
  };
};

/**
 * Middleware for using Swagger information to validate API requests/responses.
 *
 * This middleware also requires that you use the swagger-metadata middleware before this middleware.  This middleware
 * also makes no attempt to work around invalid Swagger documents.
 *
 * @param {object} [options] - The middleware options
 * @param {boolean} [options.validateResponse=false] - Whether or not to validate responses
 *
 * @returns the middleware function
 */
function swaggerValidatorMiddleware(options = {}) {
  debug('Initializing swagger-validator middleware');

  debug(
    '  Response validation: %s',
    options.validateResponse === true ? 'enabled' : 'disabled',
  );

  return function swaggerValidator(req, res, next) {
    const operation = req.swagger ? req.swagger.operation : undefined;
    let paramIndex = 0;
    const swaggerVersion = req.swagger ? req.swagger.swaggerVersion : undefined;
    let paramName; // Here since we use it in the catch block
    let paramPath; // Here since we use it in the catch block

    debug('%s %s', req.method, req.url);
    debug('  Will process: %s', _.isUndefined(operation) ? 'no' : 'yes');

    if (!_.isUndefined(operation)) {
      // If necessary, override 'res.end'
      if (options.validateResponse === true) {
        wrapEnd(req, res, next);
      }

      debug('  Request validation:');

      // Validate the request
      try {
        // Validate the content type
        try {
          validators.validateContentType(
            req.swagger.swaggerVersion === '1.2'
              ? req.swagger.api.consumes
              : req.swagger.swaggerObject.consumes,
            operation.consumes,
            req,
          );
        } catch (err) {
          err.failedValidation = true;

          throw err;
        }

        return async.map(
          swaggerVersion === '1.2'
            ? operation.parameters
            : req.swagger.operationParameters,
          (parameter, oCallback) => {
            const schema =
              swaggerVersion === '1.2' ? parameter : parameter.schema;
            const pLocation =
              swaggerVersion === '1.2' ? schema.paramType : schema.in;

            paramName = schema.name;
            paramPath =
              swaggerVersion === '1.2'
                ? req.swagger.operationPath.concat([
                    'params',
                    paramIndex.toString(),
                  ])
                : parameter.path;
            const val = req.swagger.params[paramName].value;

            // Validate requiredness
            validators.validateRequiredness(val, schema.required);

            // Quick return if the value is not present
            if (_.isUndefined(val)) {
              return oCallback();
            }

            validateValue(req, schema, paramPath, val, pLocation, oCallback);

            paramIndex += 1;

            return undefined;
          },
          err => {
            if (err) {
              throw err;
            } else {
              debug('    Validation: succeeded');

              return next();
            }
          },
        );
      } catch (err) {
        if (err.failedValidation === true) {
          if (!err.path) {
            err.path = paramPath;
          }

          if (paramName) {
            err.paramName = paramName;
          }
        }

        debug('    Validation: failed');

        mHelpers.debugError(err, debug);

        return send400(req, res, next, err);
      }
    } else {
      return next();
    }
  };
}

module.exports = swaggerValidatorMiddleware;
exports = module.exports;
