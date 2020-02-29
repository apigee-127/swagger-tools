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

const helpers = require('./helpers');

// http://tools.ietf.org/html/rfc3339#section-5.6
const dateRegExp = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
// http://tools.ietf.org/html/rfc3339#section-5.6
const dateTimeRegExp = /^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}):([0-9]{2}))$/;
const isValidDate = origDate => {
  let date = origDate;

  if (_.isDate(date)) {
    return true;
  }

  if (!_.isString(date)) {
    date = date.toString();
  }

  const matches = dateRegExp.exec(date);

  if (matches === null) {
    return false;
  }

  const day = matches[3];
  const month = matches[2];

  if (month < '01' || month > '12' || day < '01' || day > '31') {
    return false;
  }

  return true;
};

const isValidDateTime = origDateTime => {
  let dateTime = origDateTime;
  let timezoneHours;
  let timezoneMinutes;

  if (_.isDate(dateTime)) {
    return true;
  }

  if (!_.isString(dateTime)) {
    dateTime = dateTime.toString();
  }

  const parts = dateTime.toLowerCase().split('t');
  const date = parts[0];
  const time = parts.length > 1 ? parts[1] : undefined;

  if (!isValidDate(date)) {
    return false;
  }

  const matches = dateTimeRegExp.exec(time);

  if (matches === null) {
    return false;
  }

  const [, hour, minute, second] = matches;
  if (matches[5] === 'z') {
    timezoneHours = 0;
    timezoneMinutes = 0;
  } else {
    timezoneHours = Number(matches[6]);
    timezoneMinutes = Number(matches[7]);
  }

  const validTimezoneMinutes =
    timezoneMinutes === 0 ||
    timezoneMinutes === 15 ||
    timezoneMinutes === 30 ||
    timezoneMinutes === 45;

  if (
    hour > '23' ||
    minute > '59' ||
    second > '59' ||
    timezoneHours > 14 ||
    timezoneHours < -12 ||
    !validTimezoneMinutes
  ) {
    return false;
  }

  return true;
};

const throwErrorWithCode = (code, msg) => {
  const err = new Error(msg);

  err.code = code;
  err.failedValidation = true;

  throw err;
};

function validateAgainstSchema(schemaOrName, data, origValidator) {
  let validator = origValidator;

  const sanitizeError = origObj => {
    const obj = origObj;

    // Make anyOf/oneOf errors more human readable (Issue 200)
    let defType =
      ['additionalProperties', 'items'].indexOf(obj.path[obj.path.length - 1]) >
      -1
        ? 'schema'
        : obj.path[obj.path.length - 2];

    if (['ANY_OF_MISSING', 'ONE_OF_MISSING'].indexOf(obj.code) > -1) {
      switch (defType) {
        case 'parameters':
          defType = 'parameter';
          break;

        case 'responses':
          defType = 'response';
          break;

        case 'schema':
          defType += ` ${obj.path[obj.path.length - 1]}`;

        // no default
      }

      obj.message = `Not a valid ${defType} definition`;
    }

    // Remove the params portion of the error
    delete obj.params;
    delete obj.schemaId;

    if (obj.inner) {
      _.each(obj.inner, nObj => {
        sanitizeError(nObj);
      });
    }
  };
  const schema = _.isPlainObject(schemaOrName)
    ? _.cloneDeep(schemaOrName)
    : schemaOrName;

  // We don't check this due to internal usage but if validator is not provided, schemaOrName must be a schema
  if (_.isUndefined(validator)) {
    validator = helpers.createJsonValidator([schema]);
  }

  const valid = validator.validate(data, schema);

  if (!valid) {
    try {
      throwErrorWithCode(
        'SCHEMA_VALIDATION_FAILED',
        'Failed schema validation',
      );
    } catch (err) {
      err.results = {
        errors: _.map(validator.getLastErrors(), mapErr => {
          sanitizeError(mapErr);

          return mapErr;
        }),
        warnings: [],
      };

      throw err;
    }
  }
}

/**
 * Validates a schema of type array is properly formed (when necessar).
 *
 * *param {object} schema - The schema object to validate
 *
 * @throws Error if the schema says it's an array but it is not formed properly
 *
 * @see {@link https://github.com/swagger-api/swagger-spec/issues/174}
 */
const validateArrayType = schema => {
  // We have to do this manually for now
  if (schema.type === 'array' && _.isUndefined(schema.items)) {
    throwErrorWithCode(
      'OBJECT_MISSING_REQUIRED_PROPERTY',
      'Missing required property: items',
    );
  }
};

/**
 * Validates the request or response content type (when necessary).
 *
 * @param {string[]} gPOrC - The valid consumes at the API scope
 * @param {string[]} oPOrC - The valid consumes at the operation scope
 * @param {object} reqOrRes - The request or response
 *
 * @throws Error if the content type is invalid
 */
function validateContentType(gPOrC, oPOrC, reqOrRes) {
  // http://www.w3.org/Protocols/rfc2616/rfc2616-sec7.html#sec7.2.1
  const isResponse = typeof reqOrRes.end === 'function';
  let contentType = isResponse
    ? reqOrRes.getHeader('content-type')
    : reqOrRes.headers['content-type'];

  const pOrC = _.map(_.union(gPOrC, oPOrC), type => {
    return type.split(';')[0];
  });

  if (!contentType) {
    if (isResponse) {
      contentType = 'text/plain';
    } else {
      contentType = 'application/octet-stream';
    }
  }

  [contentType] = contentType.split(';');

  if (
    pOrC.length > 0 &&
    (isResponse ? true : ['POST', 'PUT'].indexOf(reqOrRes.method) !== -1) &&
    pOrC.indexOf(contentType) === -1
  ) {
    throw new Error(
      `Invalid content type (${contentType}).  These are valid: ${pOrC.join(
        ', ',
      )}`,
    );
  }
}

/**
 * Validates the value against the allowable values (when necessary).
 *
 * @param {*} val - The parameter value
 * @param {string[]} allowed - The allowable values
 *
 * @throws Error if the value is not allowable
 */
const validateEnum = (val, allowed) => {
  if (
    !_.isUndefined(allowed) &&
    !_.isUndefined(val) &&
    allowed.indexOf(val) === -1
  ) {
    throwErrorWithCode(
      'ENUM_MISMATCH',
      `Not an allowable value (${allowed.join(', ')}): ${val}`,
    );
  }
};

/**
 * Validates the value is less than the maximum (when necessary).
 *
 * @param {*} val - The parameter value
 * @param {string} maximum - The maximum value
 * @param {boolean} [exclusive=false] - Whether or not the value includes the maximum in its comparison
 *
 * @throws Error if the value is greater than the maximum
 */
const validateMaximum = (val, maximum, type, origExclusive) => {
  let exclusive = origExclusive;
  const code = exclusive === true ? 'MAXIMUM_EXCLUSIVE' : 'MAXIMUM';
  let testMax;
  let testVal;

  if (_.isUndefined(exclusive)) {
    exclusive = false;
  }

  if (type === 'integer') {
    testVal = parseInt(val, 10);
  } else if (type === 'number') {
    testVal = parseFloat(val);
  }

  if (!_.isUndefined(maximum)) {
    testMax = parseFloat(maximum);

    if (exclusive && testVal >= testMax) {
      throwErrorWithCode(
        code,
        `Greater than or equal to the configured maximum (${maximum}): ${val}`,
      );
    } else if (testVal > testMax) {
      throwErrorWithCode(
        code,
        `Greater than the configured maximum (${maximum}): ${val}`,
      );
    }
  }
};

/**
 * Validates the array count is less than the maximum (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} maxItems - The maximum number of items
 *
 * @throws Error if the value contains more items than allowable
 */
const validateMaxItems = (val, maxItems) => {
  if (!_.isUndefined(maxItems) && val.length > maxItems) {
    throwErrorWithCode(
      'ARRAY_LENGTH_LONG',
      `Array is too long (${val.length}), maximum ${maxItems}`,
    );
  }
};

/**
 * Validates the value length is less than the maximum (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} maxLength - The maximum length
 *
 * @throws Error if the value's length is greater than the maximum
 */
const validateMaxLength = (val, maxLength) => {
  if (!_.isUndefined(maxLength) && val.length > maxLength) {
    throwErrorWithCode(
      'MAX_LENGTH',
      `String is too long (${val.length} chars), maximum ${maxLength}`,
    );
  }
};

/**
 * Validates the value's property count is greater than the maximum (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} minProperties - The maximum number of properties
 *
 * @throws Error if the value's property count is less than the maximum
 */
const validateMaxProperties = (val, maxProperties) => {
  const propCount = _.isPlainObject(val) ? Object.keys(val).length : 0;

  if (!_.isUndefined(maxProperties) && propCount > maxProperties) {
    throwErrorWithCode(
      'MAX_PROPERTIES',
      `Number of properties is too many (${propCount} properties), maximum ${maxProperties}`,
    );
  }
};

/**
 * Validates the value array count is greater than the minimum (when necessary).
 *
 * @param {*} val - The parameter value
 * @param {string} minimum - The minimum value
 * @param {boolean} [exclusive=false] - Whether or not the value includes the minimum in its comparison
 *
 * @throws Error if the value is less than the minimum
 */
const validateMinimum = (val, minimum, type, origExclusive) => {
  let exclusive = origExclusive;
  const code = exclusive === true ? 'MINIMUM_EXCLUSIVE' : 'MINIMUM';
  let testMin;
  let testVal;

  if (_.isUndefined(exclusive)) {
    exclusive = false;
  }

  if (type === 'integer') {
    testVal = parseInt(val, 10);
  } else if (type === 'number') {
    testVal = parseFloat(val);
  }

  if (!_.isUndefined(minimum)) {
    testMin = parseFloat(minimum);

    if (exclusive && testVal <= testMin) {
      throwErrorWithCode(
        code,
        `Less than or equal to the configured minimum (${minimum}): ${val}`,
      );
    } else if (testVal < testMin) {
      throwErrorWithCode(
        code,
        `Less than the configured minimum (${minimum}): ${val}`,
      );
    }
  }
};

/**
 * Validates the value value contains fewer items than allowed (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} minItems - The minimum number of items
 *
 * @throws Error if the value contains fewer items than allowable
 */
const validateMinItems = (val, minItems) => {
  if (!_.isUndefined(minItems) && val.length < minItems) {
    throwErrorWithCode(
      'ARRAY_LENGTH_SHORT',
      `Array is too short (${val.length}), minimum ${minItems}`,
    );
  }
};

/**
 * Validates the value length is less than the minimum (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} minLength - The minimum length
 *
 * @throws Error if the value's length is less than the minimum
 */
const validateMinLength = (val, minLength) => {
  if (!_.isUndefined(minLength) && val.length < minLength) {
    throwErrorWithCode(
      'MIN_LENGTH',
      `String is too short (${val.length} chars), minimum ${minLength}`,
    );
  }
};

/**
 * Validates the value's property count is less than or equal to the minimum (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} minProperties - The minimum number of properties
 *
 * @throws Error if the value's property count is less than the minimum
 */
const validateMinProperties = (val, minProperties) => {
  const propCount = _.isPlainObject(val) ? Object.keys(val).length : 0;

  if (!_.isUndefined(minProperties) && propCount < minProperties) {
    throwErrorWithCode(
      'MIN_PROPERTIES',
      `Number of properties is too few (${propCount} properties), minimum ${minProperties}`,
    );
  }
};

/**
 * Validates the value is a multiple of the provided number (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} multipleOf - The number that should divide evenly into the value
 *
 * @throws Error if the value contains fewer items than allowable
 */
const validateMultipleOf = (val, multipleOf) => {
  if (!_.isUndefined(multipleOf) && val % multipleOf !== 0) {
    throwErrorWithCode('MULTIPLE_OF', `Not a multiple of ${multipleOf}`);
  }
};

/**
 * Validates the value matches a pattern (when necessary).
 *
 * @param {string} name - The parameter name
 * @param {*} val - The parameter value
 * @param {string} pattern - The pattern
 *
 * @throws Error if the value does not match the pattern
 */
const validatePattern = (val, pattern) => {
  if (!_.isUndefined(pattern) && _.isNull(val.match(new RegExp(pattern)))) {
    throwErrorWithCode(
      'PATTERN',
      `Does not match required pattern: ${pattern}`,
    );
  }
};

/**
 * Validates the value requiredness (when necessary).
 *
 * @param {*} val - The parameter value
 * @param {boolean} required - Whether or not the parameter is required
 *
 * @throws Error if the value is required but is not present
 */
const validateRequiredness = (val, required) => {
  if (!_.isUndefined(required) && required === true && _.isUndefined(val)) {
    throwErrorWithCode('REQUIRED', 'Is required');
  }
};

/**
 * Validates the value type and format (when necessary).
 *
 * @param {string} version - The Swagger version
 * @param {*} val - The parameter value
 * @param {string} type - The parameter type
 * @param {string} format - The parameter format
 * @param {boolean} [skipError=false] - Whether or not to skip throwing an error (Useful for validating arrays)
 *
 * @throws Error if the value is not the proper type or format
 */
const validateTypeAndFormat = function validateTypeAndFormat(
  version,
  origVal,
  type,
  format,
  allowEmptyValue,
  skipError,
) {
  let val = origVal;
  let result = true;
  const oVal = val;

  // If there is an empty value and we allow empty values, the value is always valid
  if (allowEmptyValue === true && val === '') {
    return;
  }

  if (_.isArray(val)) {
    _.each(val, (aVal, index) => {
      if (
        !validateTypeAndFormat(
          version,
          aVal,
          type,
          format,
          allowEmptyValue,
          true,
        )
      ) {
        throwErrorWithCode(
          'INVALID_TYPE',
          `Value at index ${index} is not a valid ${type}: ${aVal}`,
        );
      }
    });
  } else {
    // eslint-disable-next-line default-case
    switch (type) {
      case 'boolean':
        // Coerce the value only for Swagger 1.2
        if (version === '1.2' && _.isString(val)) {
          if (val === 'false') {
            val = false;
          } else if (val === 'true') {
            val = true;
          }
        }

        result = _.isBoolean(val);
        break;
      case 'integer':
        // Coerce the value only for Swagger 1.2
        if (version === '1.2' && _.isString(val)) {
          val = Number(val);
        }

        result = _.isFinite(val) && Math.round(val) === val;
        break;
      case 'number':
        // Coerce the value only for Swagger 1.2
        if (version === '1.2' && _.isString(val)) {
          val = Number(val);
        }

        result = _.isFinite(val);
        break;
      case 'string':
        if (!_.isUndefined(format)) {
          // eslint-disable-next-line default-case
          switch (format) {
            case 'date':
              result = isValidDate(val);
              break;
            case 'date-time':
              result = isValidDateTime(val);
              break;
          }
        }
        break;
      case 'void':
        result = _.isUndefined(val);
        break;
    }
  }

  if (skipError) {
    // eslint-disable-next-line consistent-return
    return result;
  }
  if (!result) {
    throwErrorWithCode(
      'INVALID_TYPE',
      type !== 'void'
        ? `Not a valid ${
            _.isUndefined(format) ? '' : `${format} `
          }${type}: ${oVal}`
        : 'Void does not allow a value',
    );
  }
};

/**
 * Validates the value values are unique (when necessary).
 *
 * @param {string[]} val - The parameter value
 * @param {boolean} isUnique - Whether or not the parameter values are unique
 *
 * @throws Error if the value has duplicates
 */
const validateUniqueItems = (val, isUnique) => {
  if (!_.isUndefined(isUnique) && _.uniq(val).length !== val.length) {
    throwErrorWithCode(
      'ARRAY_UNIQUE',
      `Does not allow duplicate values: ${val.join(', ')}`,
    );
  }
};

/**
 * Validates the value against the schema.
 *
 * @param {string} version - The Swagger version
 * @param {object} schema - The schema to use to validate things
 * @param {string[]} path - The path to the schema
 * @param {*} [val] - The value to validate or undefined to use the default value provided by the schema
 *
 * @throws Error if any validation failes
 */
const validateSchemaConstraints = (version, origSchema, origPath, origVal) => {
  let schema = origSchema;
  let path = origPath;
  let val = origVal;

  const resolveSchema = schemaToResolve => {
    let resolved = schemaToResolve;

    if (resolved.schema) {
      path = path.concat(['schema']);

      resolved = resolveSchema(resolved.schema);
    }

    return resolved;
  };

  let { type } = schema;

  if (!type) {
    if (!schema.schema) {
      if (path[path.length - 2] === 'responses') {
        type = 'void';
      } else {
        type = 'object';
      }
    } else {
      schema = resolveSchema(schema);
      type = schema.type || 'object';
    }
  }

  const allowEmptyValue = schema ? schema.allowEmptyValue === true : false;

  try {
    // Always perform this check even if there is no value
    if (type === 'array') {
      validateArrayType(schema);
    }

    // Default to default value if necessary
    if (_.isUndefined(val)) {
      val = version === '1.2' ? schema.defaultValue : schema.default;

      path = path.concat([version === '1.2' ? 'defaultValue' : 'default']);
    }

    // If there is no explicit default value, return as all validations will fail
    if (_.isUndefined(val)) {
      return;
    }

    if (type === 'array') {
      _.each(val, (v, index) => {
        try {
          validateSchemaConstraints(
            version,
            schema.items || {},
            path.concat(index.toString()),
            v,
          );
        } catch (err) {
          err.message = `Value at index ${index} ${
            err.code === 'INVALID_TYPE' ? 'is ' : ''
          }${err.message.charAt(0).toLowerCase()}${err.message.substring(1)}`;

          throw err;
        }
      });
    } else {
      validateTypeAndFormat(version, val, type, schema.format, allowEmptyValue);
    }

    // Validate enum
    validateEnum(val, schema.enum);

    // Validate maximum
    validateMaximum(val, schema.maximum, type, schema.exclusiveMaximum);

    // Validate maxItems (Swagger 2.0+)
    validateMaxItems(val, schema.maxItems);

    // Validate maxLength (Swagger 2.0+)
    validateMaxLength(val, schema.maxLength);

    // Validate maxProperties (Swagger 2.0+)
    validateMaxProperties(val, schema.maxProperties);

    // Validate minimum
    validateMinimum(val, schema.minimum, type, schema.exclusiveMinimum);

    // Validate minItems
    validateMinItems(val, schema.minItems);

    // Validate minLength (Swagger 2.0+)
    validateMinLength(val, schema.minLength);

    // Validate minProperties (Swagger 2.0+)
    validateMinProperties(val, schema.minProperties);

    // Validate multipleOf (Swagger 2.0+)
    validateMultipleOf(val, schema.multipleOf);

    // Validate pattern (Swagger 2.0+)
    validatePattern(val, schema.pattern);

    // Validate uniqueItems
    validateUniqueItems(val, schema.uniqueItems);
  } catch (err) {
    err.path = path;

    throw err;
  }
};

module.exports = {
  isValidDate,
  isValidDateTime,
  validateAgainstSchema,
  validateArrayType,
  validateContentType,
  validateEnum,
  validateMaximum,
  validateMaxItems,
  validateMaxLength,
  validateMaxProperties,
  validateMinimum,
  validateMinItems,
  validateMinLength,
  validateMinProperties,
  validateMultipleOf,
  validatePattern,
  validateRequiredness,
  validateTypeAndFormat,
  validateUniqueItems,
  validateSchemaConstraints,
};
