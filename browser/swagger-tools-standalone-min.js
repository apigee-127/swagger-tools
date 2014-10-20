!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self),(o.SwaggerTools||(o.SwaggerTools={})).specs=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";var _=require("lodash"),jjv=require("jjv"),jjve=require("jjve"),md5=require("spark-md5"),traverse=require("traverse"),helpers=require("./helpers"),validators=require("./validators"),draft04Json=require("../schemas/json-schema-draft-04.json"),draft04Url="http://json-schema.org/draft-04/schema",jjvOptions={checkRequired:!0,removeAdditional:!1,useDefault:!1,useCoerce:!1},jjveOptions={formatPath:!1},metadataCache={},refToJsonPointer=helpers.refToJsonPointer,toJsonPointer=helpers.toJsonPointer,createValidator=function(e,r){var a=jjv(jjvOptions);return a.addFormat("uri",function(){return!0}),a.addSchema(draft04Url,draft04Json),_.each(r,function(r){var t=_.cloneDeep(e.schemas[r]);t.id=r,a.addSchema(r,t)}.bind(this)),a.je=jjve(a),a},createErrorOrWarning=function(e,r,a,t,n){n.push({code:e,message:r,data:a,path:t})},createUnusedErrorOrWarning=function(e,r,a,t,n,i){createErrorOrWarning("UNUSED_"+a,t+" is defined but is not used: "+r,e,n,i)},validateExist=function(e,r,a,t,n,i){_.isUndefined(e)||-1!==e.indexOf(r)||createErrorOrWarning("UNRESOLVABLE_"+a,t+" could not be resolved: "+r,r,n,i)},validateNoExist=function(e,r,a,t,n,i){!_.isUndefined(e)&&e.indexOf(r)>-1&&createErrorOrWarning("DUPLICATE_"+a,t+" already defined: "+r,r,n,i)},validateNoDuplicates=function(e,r,a,t,n){var i=t[t.length-1];_.isUndefined(e)||e.length===_.uniq(e).length||createErrorOrWarning("DUPLICATE_"+r,a+" "+i+" has duplicate items",e,t,n)},validateParameterConstraints=function(e,r,a,t,n){switch(e.version){case"1.2":try{validators.validateTypeAndFormat(r.name,a,"array"===r.type?r.items.type:r.type,"array"===r.type&&r.items.format?r.items.format:r.format)}catch(i){return void createErrorOrWarning("INVALID_TYPE",i.message,a,t,n)}try{validators.validateEnum(r.name,a,r.enum)}catch(i){return void createErrorOrWarning("ENUM_MISMATCH",i.message,a,t,n)}try{validators.validateMaximum(r.name,a,r.maximum,r.type)}catch(i){return void createErrorOrWarning("MAXIMUM",i.message,a,t,n)}try{validators.validateMinimum(r.name,a,r.minimum,r.type)}catch(i){return void createErrorOrWarning("MINIMUM",i.message,a,t,n)}try{validators.validateUniqueItems(r.name,a,r.uniqueItems)}catch(i){return void createErrorOrWarning("ARRAY_UNIQUE",i.message,a,t,n)}break;case"2.0":try{validators.validateTypeAndFormat(r.name,a,"array"===r.type?r.items.type:r.type,"array"===r.type&&r.items.format?r.items.format:r.format)}catch(i){return void createErrorOrWarning("INVALID_TYPE",i.message,a,t,n)}try{validators.validateEnum(r.name,a,r.enum)}catch(i){return void createErrorOrWarning("ENUM_MISMATCH",i.message,a,t,n)}try{validators.validateMaximum(r.name,a,r.maximum,r.type,r.exclusiveMaximum)}catch(i){return void createErrorOrWarning(r.exclusiveMaximum===!0?"MAXIMUM_EXCLUSIVE":"MAXIMUM",i.message,a,t,n)}try{validators.validateMaxItems(r.name,a,r.maxItems)}catch(i){return void createErrorOrWarning("ARRAY_LENGTH_LONG",i.message,a,t,n)}try{validators.validateMaxLength(r.name,a,r.maxLength)}catch(i){return void createErrorOrWarning("MAX_LENGTH",i.message,a,t,n)}try{validators.validateMinimum(r.name,a,r.minimum,r.type,r.exclusiveMinimum)}catch(i){return void createErrorOrWarning("true"===r.exclusiveMinimum?"MINIMUM_EXCLUSIVE":"MINIMUM",i.message,a,t,n)}try{validators.validateMinItems(r.name,a,r.minItems)}catch(i){return void createErrorOrWarning("ARRAY_LENGTH_SHORT",i.message,a,t,n)}try{validators.validateMinLength(r.name,a,r.minLength)}catch(i){return void createErrorOrWarning("MIN_LENGTH",i.message,a,t,n)}try{validators.validatePattern(r.name,a,r.pattern)}catch(i){return void createErrorOrWarning("PATTERN",i.message,a,t,n)}try{validators.validateUniqueItems(r.name,a,r.uniqueItems)}catch(i){return void createErrorOrWarning("ARRAY_UNIQUE",i.message,a,t,n)}}},normalizePath=function(e){var r=[],a=[];return _.each(e.split("/"),function(e){"{"===e.charAt(0)&&(r.push(e.substring(1).split("}")[0]),e="{"+(r.length-1)+"}"),a.push(e)}),{path:a.join("/"),args:r}},Specification=function(e){var r,a,t=["string","number","boolean","integer","array"];switch(e){case"1.2":r="https://github.com/wordnik/swagger-spec/blob/master/versions/1.2.md",t=_.union(t,["void","File"]),a="https://github.com/wordnik/swagger-spec/tree/master/schemas/v1.2";break;case"2.0":r="https://github.com/wordnik/swagger-spec/blob/master/versions/2.0.md",t=_.union(t,["file"]),a="https://github.com/wordnik/swagger-spec/tree/master/schemas/v2.0";break;default:throw new Error(e+" is an unsupported Swagger specification version")}switch(this.docsUrl=r,this.primitives=t,this.schemasUrl=a,this.version=e,this.schemas={},this.validators={},e){case"1.2":this.schemas["apiDeclaration.json"]=require("../schemas/1.2/apiDeclaration.json"),this.schemas["authorizationObject.json"]=require("../schemas/1.2/authorizationObject.json"),this.schemas["dataType.json"]=require("../schemas/1.2/dataType.json"),this.schemas["dataTypeBase.json"]=require("../schemas/1.2/dataTypeBase.json"),this.schemas["infoObject.json"]=require("../schemas/1.2/infoObject.json"),this.schemas["modelsObject.json"]=require("../schemas/1.2/modelsObject.json"),this.schemas["oauth2GrantType.json"]=require("../schemas/1.2/oauth2GrantType.json"),this.schemas["operationObject.json"]=require("../schemas/1.2/operationObject.json"),this.schemas["parameterObject.json"]=require("../schemas/1.2/parameterObject.json"),this.schemas["resourceListing.json"]=require("../schemas/1.2/resourceListing.json"),this.schemas["resourceObject.json"]=require("../schemas/1.2/resourceObject.json"),this.validators["apiDeclaration.json"]=createValidator(this,["dataTypeBase.json","modelsObject.json","oauth2GrantType.json","authorizationObject.json","parameterObject.json","operationObject.json","apiDeclaration.json"]),this.validators["resourceListing.json"]=createValidator(this,["resourceObject.json","infoObject.json","oauth2GrantType.json","authorizationObject.json","resourceListing.json"]);break;case"2.0":this.schemas["schema.json"]=require("../schemas/2.0/schema.json"),this.validators["schema.json"]=createValidator(this,["schema.json"])}},getModelMetadata=function(e,r){var a=e[r];return _.isUndefined(a)&&(a=e[r]={composed:{},name:void 0,parents:[],refs:[],schema:void 0}),a},processModel=function e(r,a,t,n,i,s){var o=getModelMetadata(a,n),c=function(e){return 0===e.indexOf("http://")||0===e.indexOf("https://")};switch(o.schema=t,o.name=n,o.path=i,r.version){case"1.2":o.name=i[i.length-1],_.each(t.properties,function(e,t){var n=i.concat("properties",t);e.$ref?getModelMetadata(a,e.$ref).refs.push(n.concat(["$ref"])):"array"===e.type&&e.items.$ref&&getModelMetadata(a,e.items.$ref).refs.push(n.concat(["items","$ref"])),_.isUndefined(e.defaultValue)||validateParameterConstraints(r,e,e.defaultValue,n.concat("defaultValue"),s.errors)}),_.each(_.uniq(t.subTypes),function(e,r){var t=getModelMetadata(a,e);t.parents.push(n),t.refs.push(i.concat("subTypes",r.toString()))});break;case"2.0":_.each(_.uniq(t.allOf),function(t,n){var d=i.concat("allOf",n.toString());_.isUndefined(t.$ref)?(e(r,a,t,toJsonPointer(d),d,s),o.parents.push(toJsonPointer(d))):c(t.$ref)||(o.parents.push(refToJsonPointer(t.$ref)),getModelMetadata(a,refToJsonPointer(t.$ref)).refs.push(d.concat("$ref")))}),_.isUndefined(t.default)||validateParameterConstraints(r,t,t.defaultValue,i.concat("default"),s.errors),t.$ref?c(t.$ref)||getModelMetadata(a,refToJsonPointer(t.$ref)).refs.push(i.concat(["$ref"])):"array"===t.type&&(t.items.$ref?c(t.items.$ref)||getModelMetadata(a,refToJsonPointer(t.items.$ref)).refs.push(i.concat(["items","$ref"])):_.isUndefined(t.items.type)||-1!==r.primitives.indexOf(t.items.type)||_.each(t.items,function(t,n){var o=i.concat("items",n.toString());e(r,a,t,toJsonPointer(o),o,s)})),_.each(t.properties,function(t,n){var o=i.concat("properties",n);t.$ref?c(t.$ref)||getModelMetadata(a,refToJsonPointer(t.$ref)).refs.push(o.concat(["$ref"])):"array"===t.type&&(t.items.$ref?c(t.items.$ref)||getModelMetadata(a,refToJsonPointer(t.items.$ref)).refs.push(o.concat(["items","$ref"])):_.isUndefined(t.items.type)||-1!==r.primitives.indexOf(t.items.type)||_.each(t.items,function(t,n){var i=o.concat("items",n.toString());e(r,a,t,toJsonPointer(i),i,s)}))}),-1===toJsonPointer(i).indexOf("#/definitions/")&&o.refs.push(i)}},getModelsMetadata=function(e,r,a){var t,n={},i={errors:[],warnings:[]},s={},o={},c=function(r,a){var n=t[r].schema;n&&(_.each(n.properties,function(t,n){var s=_.cloneDeep(t);a.properties[n]?createErrorOrWarning("CHILD_MODEL_REDECLARES_PROPERTY","Child model declares property already declared by ancestor: "+n,t,"1.2"===e.version?["models",r,"properties",n]:r.substring(2).split("/").concat("properties",n),i.errors):("1.2"===e.version&&(_.isUndefined(s.maximum)||(s.maximum=parseFloat(s.maximum)),_.isUndefined(s.minimum)||(s.minimum=parseFloat(s.minimum))),a.properties[n]=s)}),!_.isUndefined(n.required)&&_.isUndefined(a.required)&&(a.required=[]),_.each(n.required,function(e){-1===a.required.indexOf(e)&&a.required.push(e)}))},d=function(e,r){var a=!1;return Object.keys(r).filter(function(t){return t===e&&(a=!0),a&&r[t]})},u=function p(r,a,n,s,o){var u=t[r],h=u.schema;s[r]=!0,_.isUndefined(h)||(u.parents.length>1&&"1.2"===e.version?createErrorOrWarning("MULTIPLE_MODEL_INHERITANCE","Child model is sub type of multiple models: "+u.parents.join(" && "),h,["models",r],i.errors):_.each(u.parents,function(t){n[t]||(s[t]&&(a[r]=d(t,s),createErrorOrWarning("CYCLICAL_MODEL_INHERITANCE","Model has a circular inheritance: "+r+" -> "+a[r].join(" -> "),"1.2"===e.version?h.subTypes:h.allOf,"1.2"===e.version?["models",r,"subTypes"]:r.substring(2).split("/").concat("allOf"),i.errors)),a[r]||p(t,a,n,s,o)),a[r]||c(t,o)})),n[r]=!0,s[r]=!1},h=md5.hash(JSON.stringify(r)),m=metadataCache[h];if(_.isUndefined(m)){switch(m=metadataCache[h]={metadata:{},results:i},t=m.metadata,e.version){case"1.2":_.reduce(r.models,function(r,a,n){return validateNoExist(r,a.id,"MODEL_DEFINITION","Model",["models",n,"id"],i.errors),processModel(e,t,a,a.id,["models",n],i),r.concat(a.id)},[]);break;case"2.0":_.each(r.definitions,function(r,a){var n=["definitions",a];processModel(e,t,r,toJsonPointer(n),n,i)})}_.each(t,function(e,r){e.composed={title:"Composed "+r,type:"object",properties:{}},_.isUndefined(e.schema)||(u(r,n,s,o,e.composed),c(r,e.composed)),_.isUndefined(e.schema)||_.isUndefined(e.schema.required)||_.each(e.schema.required,function(r,t){_.isUndefined(e.composed.properties[r])&&createErrorOrWarning("MISSING_REQUIRED_MODEL_PROPERTY","Model requires property but it is not defined: "+r,r,e.path.concat(["required",t.toString()]),a.errors)})}),_.each(t,function(r){var a=traverse(r.composed).reduce(function(r){return"$ref"===this.key&&(r[toJsonPointer(this.path)]="1.2"===e.version?this.node:refToJsonPointer(this.node)),r},{});_.each(a,function(e,a){var n=a.substring(2).split("/"),i=_.isUndefined(t[e])?void 0:_.cloneDeep(t[e].composed);_.isUndefined(i)||(delete i.id,delete i.title,traverse(r.composed).set(n.slice(0,n.length-1),i))})}),_.isUndefined(a)||_.each(i,function(e,r){a[r]=a[r].concat(e)})}return m},validateWithSchema=function(e,r,a){var t=e.validators[r],n=t.schema[r],i=t.validate(n,a),s={errors:[],warnings:[]};return i&&(s={errors:t.je(n,a,i,jjveOptions),warnings:[]}),s},validateContent=function(e,r,a){var t={errors:[],warnings:[]},n={},i={},s=[],o=[];switch(e.version){case"1.2":_.each(r.apis,function(e,r){validateNoExist(s,e.path,"RESOURCE_PATH","Resource path",["apis",r.toString(),"path"],t.errors),-1===s.indexOf(e.path)&&s.push(e.path)}),0===t.errors.length&&(_.each(r.authorizations,function(e,r){n[r]=_.map(e.scopes,function(e){return e.scope})},{}),t.apiDeclarations=[],_.each(a,function(r,a){var c=t.apiDeclarations[a]={errors:[],warnings:[]},d={},u={},h=getModelsMetadata(e,r,c).metadata,m=function(e,r){var a=getModelMetadata(h,e);a.refs.push(r)},p=function(e,r){var a;_.isUndefined(d[e])?(a=i[e],_.isUndefined(a)&&(a=i[e]=[])):(a=u[e],_.isUndefined(a)&&(a=u[e]=[])),-1===a.indexOf(r)&&a.push(r)};_.each(r.authorizations,function(e,r){d[r]=_.map(e.scopes,function(e){return e.scope})},{}),validateNoExist(o,r.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],c.errors),validateExist(s,r.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],c.errors),-1===o.indexOf(r.resourcePath)&&o.push(r.resourcePath),_.each(["consumes","produces"],function(e){validateNoDuplicates(r[e],"API_"+e.toUpperCase(),"API",[e],c.warnings)}),_.reduce(r.apis,function(r,a,t){var i=["apis",t.toString()],s=normalizePath(a.path),o=[];return r.indexOf(s.path)>-1&&createErrorOrWarning("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+a.path,a.path,i.concat("path"),c.errors),_.reduce(a.operations,function(r,t,u){var h=i.concat(["operations",u.toString()]);return _.each(["consumes","produces"],function(e){validateNoDuplicates(t[e],"OPERATION_"+e.toUpperCase(),"Operation",h.concat(e),c.warnings)}),validateNoExist(r,t.method,"OPERATION_METHOD","Operation method",h.concat("method"),c.errors),_.each(t.authorizations,function(e,r){validateExist(_.uniq(Object.keys(d).concat(Object.keys(n))),r,"AUTHORIZATION","Authorization",h.concat(["authorizations",r]),c.errors),_.each(e,function(e,a){_.isUndefined(d[r])&&_.isUndefined(n[r])||validateExist(_.uniq((d[r]||[]).concat(n[r]||[])),e.scope,"AUTHORIZATION_SCOPE","Authorization scope",h.concat(["authorizations",r,a.toString(),"scope"]),c.errors),p(r,e.scope)})}),_.reduce(t.parameters,function(r,a,t){return-1===e.primitives.indexOf(a.type)?m(a.type,h.concat(["parameters",t.toString(),"type"])):"array"===a.type&&a.items.$ref&&m(a.items.$ref,h.concat(["parameters",t.toString(),"items","$ref"])),validateNoExist(r,a.name,"OPERATION_PARAMETER","Operation parameter",h.concat("parameters",t.toString(),"name"),c.errors),"path"===a.paramType&&(-1===s.args.indexOf(a.name)&&createErrorOrWarning("UNRESOLVABLE_API_PATH_PARAMETER","API path parameter could not be resolved: "+a.name,a.name,h.concat("parameters",t.toString(),"name"),c.errors),-1===o.indexOf(a.name)&&o.push(a.name)),_.isUndefined(a.defaultValue)||validateParameterConstraints(e,a,a.defaultValue,h.concat("parameters",t.toString(),"defaultValue"),c.errors),r.concat(a.name)},[]),_.each(_.difference(s.args,o),function(e){createErrorOrWarning("MISSING_API_PATH_PARAMETER","API requires path parameter but it is not defined: "+e,a.path,i.concat("path"),c.errors)}),_.reduce(t.responseMessages,function(e,r,a){return validateNoExist(e,r.code,"RESPONSE_MESSAGE_CODE","Response message code",h.concat(["responseMessages",a.toString(),"code"]),c.errors),r.responseModel&&m(r.responseModel,h.concat(["responseMessages",a.toString(),"responseModel"])),e.concat(r.code)},[]),"array"===t.type&&t.items.$ref?m(t.items.$ref,h.concat(["items","$ref"])):-1===e.primitives.indexOf(t.type)&&m(t.type,h.concat(["type"])),r.concat(t.method)},[]),r.concat(s.path)},[]),_.each(h,function(e,r){_.isUndefined(e.schema)&&_.each(e.refs,function(e){createErrorOrWarning("UNRESOLVABLE_MODEL","Model could not be resolved: "+r,r,e,c.errors)}),0===e.refs.length&&createUnusedErrorOrWarning(e.schema,r,"MODEL","Model",["models",e.name],c.warnings)}),_.each(_.difference(Object.keys(d),Object.keys(u)),function(e){createUnusedErrorOrWarning(r.authorizations[e],e,"AUTHORIZATION","Authorization",["authorizations",e],c.warnings)}),_.each(d,function(e,a){var t=["authorizations",a],n=r.authorizations[a];_.each(_.difference(e,u[a]||[]),function(r){var a=e.indexOf(r);createUnusedErrorOrWarning(n.scopes[a],r,"AUTHORIZATION_SCOPE","Authorization scope",t.concat(["scopes",a.toString()]),c.warnings)})})}),_.each(_.difference(s,o),function(e){var a=_.map(r.apis,function(e){return e.path}).indexOf(e);createUnusedErrorOrWarning(r.apis[a].path,e,"RESOURCE_PATH","Resource path",["apis",a.toString(),"path"],t.errors)}),_.each(_.difference(Object.keys(n),Object.keys(i)),function(e){createUnusedErrorOrWarning(r.authorizations[e],e,"AUTHORIZATION","Authorization",["authorizations",e],t.warnings)}),_.each(i,function(e,a){var n=["authorizations",a];_.each(_.difference(e,i[a]),function(i){var s=e.indexOf(i);createUnusedErrorOrWarning(r.authorizations[a].scopes[s],i,"AUTHORIZATION_SCOPE","Authorization scope",n.concat(["scopes",s.toString()]),t.warnings)})}));break;case"2.0":if(_.each(["consumes","produces","schemes"],function(e){validateNoDuplicates(r[e],"API_"+e.toUpperCase(),"API",[e],t.warnings)}),0===t.errors.length&&0===t.warnings.length){var c=getModelsMetadata(e,r,t).metadata;_.reduce(r.paths,function(r,a,n){var i=["paths",n],s=normalizePath(n),o=[];return r.indexOf(s.path)>-1&&createErrorOrWarning("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+n,n,i,t.errors),_.each(a,function(r,n){var d=i.concat(n);return"parameters"===n?void _.reduce(a.parameters,function(r,a,n){var i=d.concat(n.toString());return validateNoExist(r,a.name,"API_PARAMETER","API parameter",i.concat("name"),t.errors),"path"===a.in&&(-1===s.args.indexOf(a.name)&&createErrorOrWarning("UNRESOLVABLE_API_PATH_PARAMETER","API path parameter could not be resolved: "+a.name,a.name,i.concat("name"),t.errors),-1===o.indexOf(a.name)&&o.push(a.name)),_.isUndefined(a.schema)||processModel(e,c,a.schema,toJsonPointer(i.concat("schema")),i.concat("schema"),t),r.concat(a.name)},[]):(_.each(["consumes","produces","schemes"],function(e){validateNoDuplicates(r[e],"OPERATION_"+e.toUpperCase(),"Operation",d.concat(e),t.warnings)}),_.reduce(r.parameters,function(r,a,n){var i=d.concat("parameters",n.toString());return validateNoExist(r,a.name,"OPERATION_PARAMETER","Operation parameter",i.concat("name"),t.errors),"path"===a.in&&(-1===s.args.indexOf(a.name)&&createErrorOrWarning("UNRESOLVABLE_API_PATH_PARAMETER","API path parameter could not be resolved: "+a.name,a.name,i.concat("name"),t.errors),-1===o.indexOf(a.name)&&o.push(a.name)),_.isUndefined(a.schema)||processModel(e,c,a.schema,toJsonPointer(i.concat("schema")),i.concat("schema"),t),r.concat(a.name)},[]),void _.each(r.responses,function(r,a){var t=d.concat("responses",a);_.isUndefined(r.schema)||processModel(e,c,r.schema,toJsonPointer(t.concat("schema")),t.concat("schema"),r)}))}),_.each(_.difference(s.args,o),function(e){createErrorOrWarning("MISSING_API_PATH_PARAMETER","API requires path parameter but it is not defined: "+e,n,i,t.errors)}),r.concat(s.path)},[]),_.each(c,function(e,r){_.isUndefined(e.schema)&&_.each(e.refs,function(e){createErrorOrWarning("UNRESOLVABLE_MODEL","Model could not be resolved: "+r,r,e,t.errors)}),0===e.refs.length&&createUnusedErrorOrWarning(e.schema,r,"MODEL","Model",r.substring(2).split("/"),t.warnings)})}}return t};Specification.prototype.validate=function(e,r){var a={errors:[],warnings:[]},t=!1;switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("resourceListing is required");if(!_.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(_.isUndefined(r))throw new Error("apiDeclarations is required");if(!_.isArray(r))throw new TypeError("apiDeclarations must be an array");a=validateWithSchema(this,"resourceListing.json",e),a.errors.length>0&&(t=!0),t||(a.apiDeclarations=[],_.each(r,function(e,r){return a.apiDeclarations[r]=validateWithSchema(this,"apiDeclaration.json",e),a.apiDeclarations[r].errors.length>0?(t=!0,!1):void 0}.bind(this))),t||(a=validateContent(this,e,r)),a=a.errors.length>0||a.warnings.length>0||_.reduce(a.apiDeclarations,function(e,r){return e+(_.isArray(r.errors)?r.errors.length:0)+(_.isArray(r.warnings)?r.warnings.length:0)},0)>0?a:void 0;break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object");a=validateWithSchema(this,"schema.json",e),a.errors.length>0&&(t=!0),t||(a=validateContent(this,e)),a=a.errors.length>0||a.warnings.length>0?a:void 0}return a},Specification.prototype.composeModel=function(e,r){var a,t,n,i;switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("apiDeclaration is required");if(!_.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(_.isUndefined(r))throw new Error("modelId is required");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(_.isUndefined(r))throw new Error("modelIdOrPath is required")}if(a=getModelsMetadata(this,e),n=a.metadata,a.results.errors.length>0)throw i=new Error("The models are invalid and model composition is not possible"),i.errors=a.results.errors,i.warnings=a.results.warnings,i;return t=n["1.2"===this.version?r:refToJsonPointer(r)],_.isUndefined(t)?void 0:t.composed},Specification.prototype.validateModel=function(e,r,a){var t,n,i=this.composeModel(e,r);if(_.isUndefined(i))throw Error("Unable to compose model so validation is not possible");return n=jjv(jjvOptions),n.addFormat("uri",function(){return!0}),n.addSchema(draft04Url,draft04Json),n.je=jjve(n),t=n.validate(i,a),t=t?{errors:n.je(i,a,t,jjveOptions)}:void 0},module.exports.v1=module.exports.v1_2=new Specification("1.2"),module.exports.v2=module.exports.v2_0=new Specification("2.0");
},{"../schemas/1.2/apiDeclaration.json":10,"../schemas/1.2/authorizationObject.json":11,"../schemas/1.2/dataType.json":12,"../schemas/1.2/dataTypeBase.json":13,"../schemas/1.2/infoObject.json":14,"../schemas/1.2/modelsObject.json":15,"../schemas/1.2/oauth2GrantType.json":16,"../schemas/1.2/operationObject.json":17,"../schemas/1.2/parameterObject.json":18,"../schemas/1.2/resourceListing.json":19,"../schemas/1.2/resourceObject.json":20,"../schemas/2.0/schema.json":21,"../schemas/json-schema-draft-04.json":22,"./helpers":2,"./validators":3,"jjv":4,"jjve":6,"lodash":7,"spark-md5":8,"traverse":9}],2:[function(require,module,exports){
"use strict";var _=require("lodash"),specCache={};module.exports.getSpec=function(e){var r=specCache[e];if(_.isUndefined(r))switch(e){case"1.2":r=require("../lib/specs").v1_2;break;case"2.0":r=require("../lib/specs").v2_0}return r},module.exports.refToJsonPointer=function(e){return"#"!==e.charAt(0)&&(e="#/definitions/"+e),e},module.exports.toJsonPointer=function(e){return"#/"+e.map(function(e){return e.replace(/\//g,"~1")}).join("/")};
},{"../lib/specs":undefined,"lodash":7}],3:[function(require,module,exports){
"use strict";var _=require("lodash"),helpers=require("./helpers"),dateRegExp=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/,dateTimeRegExp=/^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/,throwInvalidParameter=function(e,a){var t=new Error("Parameter ("+e+") "+a);throw t.failedValidation=!0,t},isValidDate=function(e){var a,t,i;return _.isString(e)||(e=e.toString()),t=dateRegExp.exec(e),null===t?!1:(a=t[3],i=t[2],"01">i||i>"12"||"01">a||a>"31"?!1:!0)},isValidDateTime=function(e){var a,t,i,n,r,o,d;return _.isString(e)||(e=e.toString()),o=e.toLowerCase().split("t"),t=o[0],i=o.length>1?o[1]:void 0,isValidDate(t)?(n=dateTimeRegExp.exec(i),null===n?!1:(a=n[1],r=n[2],d=n[3],a>"23"||r>"59"||d>"59"?!1:!0)):!1};module.exports.validateContentType=function(e,a,t){var i=t.headers["content-type"]||"application/octet-stream",n=_.union(a,e);if(i=i.split(";")[0],n.length>0&&-1!==["POST","PUT"].indexOf(t.method)&&-1===n.indexOf(i))throw new Error("Invalid content type ("+i+").  These are valid: "+n.join(", "))},module.exports.validateEnum=function(e,a,t){_.isUndefined(t)||_.isUndefined(a)||-1!==t.indexOf(a)||throwInvalidParameter(e,"is not an allowable value ("+t.join(", ")+"): "+a)},module.exports.validateMaximum=function(e,a,t,i,n){var r,o;_.isUndefined(n)&&(n=!1),"integer"===i?o=parseInt(a,10):"number"===i&&(o=parseFloat(a)),_.isUndefined(t)||(r=parseFloat(t),n&&o>=r?throwInvalidParameter(e,"is greater than or equal to the configured maximum ("+t+"): "+a):o>r&&throwInvalidParameter(e,"is greater than the configured maximum ("+t+"): "+a))},module.exports.validateMaxItems=function(e,a,t){!_.isUndefined(t)&&a.length>t&&throwInvalidParameter(e,"contains more items than allowed: "+t)},module.exports.validateMaxLength=function(e,a,t){!_.isUndefined(t)&&a.length>t&&throwInvalidParameter(e,"is longer than allowed: "+t)},module.exports.validateMinimum=function(e,a,t,i,n){var r,o;_.isUndefined(n)&&(n=!1),"integer"===i?o=parseInt(a,10):"number"===i&&(o=parseFloat(a)),_.isUndefined(t)||(r=parseFloat(t),n&&r>=o?throwInvalidParameter(e,"is less than or equal to the configured minimum ("+t+"): "+a):r>o&&throwInvalidParameter(e,"is less than the configured minimum ("+t+"): "+a))},module.exports.validateMinItems=function(e,a,t){!_.isUndefined(t)&&a.length<t&&throwInvalidParameter(e,"contains fewer items than allowed: "+t)},module.exports.validateMinLength=function(e,a,t){!_.isUndefined(t)&&a.length<t&&throwInvalidParameter(e,"is shorter than allowed: "+t)},module.exports.validateModel=function(e,a,t,i,n){var r=helpers.getSpec(t),o=function(a){var t=r.validateModel(i,n,a);if(!_.isUndefined(t))try{throwInvalidParameter(e,"is not a valid "+n+" model")}catch(o){throw o.errors=t.errors,o}};_.isArray(a)?_.each(a,function(e){o(e)}):o(a)},module.exports.validatePattern=function(e,a,t){!_.isUndefined(t)&&_.isNull(a.match(new RegExp(t)))&&throwInvalidParameter(e,"does not match required pattern: "+t)},module.exports.validateRequiredness=function(e,a,t){!_.isUndefined(t)&&t===!0&&_.isUndefined(a)&&throwInvalidParameter(e,"is required")},module.exports.validateTypeAndFormat=function e(a,t,i,n,r){var o=!0;if(_.isArray(t))_.each(t,function(t,r){e(a,t,i,n,!0)||throwInvalidParameter(a,"at index "+r+" is not a valid "+i+": "+t)});else switch(i){case"boolean":o=_.isBoolean(t)||-1!==["false","true"].indexOf(t);break;case"integer":o=!_.isNaN(parseInt(t,10));break;case"number":o=!_.isNaN(parseFloat(t));break;case"string":if(!_.isUndefined(n))switch(n){case"date":o=isValidDate(t);break;case"date-time":o=isValidDateTime(t)}}return r?o:void(o||throwInvalidParameter(a,"is not a valid "+(_.isUndefined(n)?"":n+" ")+i+": "+t))},module.exports.validateUniqueItems=function(e,a,t){_.isUndefined(t)||_.uniq(a).length===a.length||throwInvalidParameter(e,"does not allow duplicate values: "+a.join(", "))};
},{"./helpers":2,"lodash":7}],4:[function(require,module,exports){
module.exports=require("./lib/jjv.js");
},{"./lib/jjv.js":5}],5:[function(require,module,exports){
(function(){function e(){return this instanceof e?(this.coerceType={},this.fieldType=t(o),this.fieldValidate=t(f),this.fieldFormat=t(a),this.defaultOptions=t(p),void(this.schema={})):new e}var t=function(e){if(null===e||"object"!=typeof e)return e;var r;if(e instanceof Date)return r=new Date,r.setTime(e.getTime()),r;if(e instanceof RegExp)return r=new RegExp(e);if(e instanceof Array){r=[];for(var n=0,i=e.length;i>n;n++)r[n]=t(e[n]);return r}if(e instanceof Object){r={};for(var o in e)e.hasOwnProperty(o)&&(r[o]=t(e[o]));return r}throw new Error("Unable to clone object!")},r=function(e){for(var r=[t(e[0])],n=r[0].key,i=r[0].object,o=1,a=e.length;a>o;o++)i=i[n],n=e[o].key,r.push({object:i,key:n});return r},n=function(e,t){var r=e.length-1,n=e[r].key;t[r].object[n]=e[r].object[n]},i={type:!0,not:!0,anyOf:!0,allOf:!0,oneOf:!0,$ref:!0,$schema:!0,id:!0,exclusiveMaximum:!0,exclusiveMininum:!0,properties:!0,patternProperties:!0,additionalProperties:!0,items:!0,additionalItems:!0,required:!0,"default":!0,title:!0,description:!0,definitions:!0,dependencies:!0},o={"null":function(e){return null===e},string:function(e){return"string"==typeof e},"boolean":function(e){return"boolean"==typeof e},number:function(e){return"number"==typeof e&&e===e},integer:function(e){return"number"==typeof e&&e%1===0},object:function(e){return e&&"object"==typeof e&&!Array.isArray(e)},array:function(e){return Array.isArray(e)},date:function(e){return e instanceof Date}},a={alpha:function(e){return/^[a-zA-Z]+$/.test(e)},alphanumeric:function(e){return/^[a-zA-Z0-9]+$/.test(e)},identifier:function(e){return/^[-_a-zA-Z0-9]+$/.test(e)},hexadecimal:function(e){return/^[a-fA-F0-9]+$/.test(e)},numeric:function(e){return/^[0-9]+$/.test(e)},"date-time":function(e){return!isNaN(Date.parse(e))&&-1===e.indexOf("/")},uppercase:function(e){return e===e.toUpperCase()},lowercase:function(e){return e===e.toLowerCase()},hostname:function(e){return e.length<256&&/^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])(\.([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]))*$/.test(e)},uri:function(e){return/[-a-zA-Z0-9@:%_\+.~#?&//=]{2,256}\.[a-z]{2,4}\b(\/[-a-zA-Z0-9@:%_\+.~#?&//=]*)?/.test(e)},email:function(e){return/^(?:[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+\.)*[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+@(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!\.)){0,61}[a-zA-Z0-9]?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!$)){0,61}[a-zA-Z0-9]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\]))$/.test(e)},ipv4:function(e){if(/^(\d?\d?\d)\.(\d?\d?\d)\.(\d?\d?\d)\.(\d?\d?\d)$/.test(e)){var t=e.split(".").sort();if(t[3]<=255)return!0}return!1},ipv6:function(e){return/^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/.test(e)}},f={readOnly:function(){return!1},minimum:function(e,t,r){return!(t>e||r.exclusiveMinimum&&t>=e)},maximum:function(e,t,r){return!(e>t||r.exclusiveMaximum&&e>=t)},multipleOf:function(e,t){return e/t%1===0||"number"!=typeof e},pattern:function(e,t){if("string"!=typeof e)return!0;var r,n;"string"==typeof t?r=t:(r=t[0],n=t[1]);var i=new RegExp(r,n);return i.test(e)},minLength:function(e,t){return e.length>=t||"string"!=typeof e},maxLength:function(e,t){return e.length<=t||"string"!=typeof e},minItems:function(e,t){return e.length>=t||!Array.isArray(e)},maxItems:function(e,t){return e.length<=t||!Array.isArray(e)},uniqueItems:function(e){for(var t,r={},n=0,i=e.length;i>n;n++){if(t=JSON.stringify(e[n]),r.hasOwnProperty(t))return!1;r[t]=!0}return!0},minProperties:function(e,t){if("object"!=typeof e)return!0;var r=0;for(var n in e)e.hasOwnProperty(n)&&(r+=1);return r>=t},maxProperties:function(e,t){if("object"!=typeof e)return!0;var r=0;for(var n in e)e.hasOwnProperty(n)&&(r+=1);return t>=r},constant:function(e,t){return JSON.stringify(e)==JSON.stringify(t)},"enum":function(e,t){var r,n,i;if("object"==typeof e){for(i=JSON.stringify(e),r=0,n=t.length;n>r;r++)if(i===JSON.stringify(t[r]))return!0}else for(r=0,n=t.length;n>r;r++)if(e===t[r])return!0;return!1}},s=function(e){return-1===e.indexOf("://")?e:e.split("#")[0]},u=function(e,t,r){var n,i,o,a;if(o=r.indexOf("#"),-1===o)return e.schema.hasOwnProperty(r)?[e.schema[r]]:null;if(o>0)if(a=r.substr(0,o),r=r.substr(o+1),e.schema.hasOwnProperty(a))t=[e.schema[a]];else{if(!t||t[0].id!==a)return null;t=[t[0]]}else{if(!t)return null;r=r.substr(1)}if(""===r)return[t[0]];if("/"===r.charAt(0)){for(r=r.substr(1),n=t[0],i=r.split("/");i.length>0;){if(!n.hasOwnProperty(i[0]))return null;n=n[i[0]],t.push(n),i.shift()}return t}return null},c=function(e,t){var r,n,i,o,a=e.length-1,f=/^(\d+)/.exec(t);if(f){if(t=t.substr(f[0].length),i=parseInt(f[1],10),0>i||i>a)return;if(o=e[a-i],"#"===t)return o.key}else o=e[0];if(n=o.object[o.key],""===t)return n;if("/"===t.charAt(0)){for(t=t.substr(1),r=t.split("/");r.length>0;){if(r[0]=r[0].replace(/~1/g,"/").replace(/~0/g,"~"),!n.hasOwnProperty(r[0]))return;n=n[r[0]],r.shift()}return n}},l=function(e,t,o,a){var f,s,p,d,h,y,m,O,g,w,P,b,A,v=!1,j={},k=t.length-1,$=t[k],x=o.length-1,z=o[x].object,Z=o[x].key,I=z[Z];if($.hasOwnProperty("$ref"))return t=u(e,t,$.$ref),t?l(e,t,o,a):{$ref:$.$ref};if($.hasOwnProperty("type"))if("string"==typeof $.type){if(a.useCoerce&&e.coerceType.hasOwnProperty($.type)&&(I=z[Z]=e.coerceType[$.type](I)),!e.fieldType[$.type](I))return{type:$.type}}else{for(v=!0,f=0,s=$.type.length;s>f&&v;f++)e.fieldType[$.type[f]](I)&&(v=!1);if(v)return{type:$.type}}if($.hasOwnProperty("allOf"))for(f=0,s=$.allOf.length;s>f;f++)if(O=l(e,t.concat($.allOf[f]),o,a))return O;if(a.useCoerce||a.useDefault||a.removeAdditional){if($.hasOwnProperty("oneOf")){for(A=1/0,f=0,s=$.oneOf.length,p=0;s>f;f++)if(P=r(o),O=l(e,t.concat($.oneOf[f]),P,a))b=O.schema?Object.keys(O.schema).length:1,A>b&&(A=b,j=O);else{if(p+=1,p>1)break;n(P,o)}if(p>1)return{oneOf:!0};if(1>p)return j;j={}}if($.hasOwnProperty("anyOf")){for(j=null,A=1/0,f=0,s=$.anyOf.length;s>f;f++){if(P=r(o),O=l(e,t.concat($.anyOf[f]),P,a),!O){n(P,o),j=null;break}b=O.schema?Object.keys(O.schema).length:1,A>b&&(A=b,j=O)}if(j)return j}if($.hasOwnProperty("not")&&(P=r(o),O=l(e,t.concat($.not),P,a),!O))return{not:!0}}else{if($.hasOwnProperty("oneOf")){for(A=1/0,f=0,s=$.oneOf.length,p=0;s>f;f++)if(O=l(e,t.concat($.oneOf[f]),o,a))b=O.schema?Object.keys(O.schema).length:1,A>b&&(A=b,j=O);else if(p+=1,p>1)break;if(p>1)return{oneOf:!0};if(1>p)return j;j={}}if($.hasOwnProperty("anyOf")){for(j=null,A=1/0,f=0,s=$.anyOf.length;s>f;f++){if(O=l(e,t.concat($.anyOf[f]),o,a),!O){j=null;break}b=O.schema?Object.keys(O.schema).length:1,A>b&&(A=b,j=O)}if(j)return j}if($.hasOwnProperty("not")&&(O=l(e,t.concat($.not),o,a),!O))return{not:!0}}if($.hasOwnProperty("dependencies"))for(y in $.dependencies)if($.dependencies.hasOwnProperty(y)&&I.hasOwnProperty(y))if(Array.isArray($.dependencies[y])){for(f=0,s=$.dependencies[y].length;s>f;f++)if(!I.hasOwnProperty($.dependencies[y][f]))return{dependencies:!0}}else if(O=l(e,t.concat($.dependencies[y]),o,a))return O;if(Array.isArray(I)){if($.hasOwnProperty("items"))if(Array.isArray($.items)){for(f=0,s=$.items.length;s>f;f++)O=l(e,t.concat($.items[f]),o.concat({object:I,key:f}),a),null!==O&&(j[f]=O,v=!0);if(I.length>s&&$.hasOwnProperty("additionalItems"))if("boolean"==typeof $.additionalItems){if(!$.additionalItems)return{additionalItems:!0}}else for(f=s,s=I.length;s>f;f++)O=l(e,t.concat($.additionalItems),o.concat({object:I,key:f}),a),null!==O&&(j[f]=O,v=!0)}else for(f=0,s=I.length;s>f;f++)O=l(e,t.concat($.items),o.concat({object:I,key:f}),a),null!==O&&(j[f]=O,v=!0);else if($.hasOwnProperty("additionalItems")&&"boolean"!=typeof $.additionalItems)for(f=0,s=I.length;s>f;f++)O=l(e,t.concat($.additionalItems),o.concat({object:I,key:f}),a),null!==O&&(j[f]=O,v=!0);if(v)return{schema:j}}else{g=[],j={};for(y in I)I.hasOwnProperty(y)&&g.push(y);if(a.checkRequired&&$.required)for(f=0,s=$.required.length;s>f;f++)I.hasOwnProperty($.required[f])||(j[$.required[f]]={required:!0},v=!0);if(d=$.hasOwnProperty("properties"),h=$.hasOwnProperty("patternProperties"),d||h)for(f=g.length;f--;){if(w=!1,d&&$.properties.hasOwnProperty(g[f])&&(w=!0,O=l(e,t.concat($.properties[g[f]]),o.concat({object:I,key:g[f]}),a),null!==O&&(j[g[f]]=O,v=!0)),h)for(y in $.patternProperties)$.patternProperties.hasOwnProperty(y)&&g[f].match(y)&&(w=!0,O=l(e,t.concat($.patternProperties[y]),o.concat({object:I,key:g[f]}),a),null!==O&&(j[g[f]]=O,v=!0));w&&g.splice(f,1)}if(a.useDefault&&d&&!v)for(y in $.properties)$.properties.hasOwnProperty(y)&&!I.hasOwnProperty(y)&&$.properties[y].hasOwnProperty("default")&&(I[y]=$.properties[y]["default"]);if(a.removeAdditional&&d&&$.additionalProperties!==!0&&"object"!=typeof $.additionalProperties)for(f=0,s=g.length;s>f;f++)delete I[g[f]];else if($.hasOwnProperty("additionalProperties"))if("boolean"==typeof $.additionalProperties){if(!$.additionalProperties)for(f=0,s=g.length;s>f;f++)j[g[f]]={additional:!0},v=!0}else for(f=0,s=g.length;s>f;f++)O=l(e,t.concat($.additionalProperties),o.concat({object:I,key:g[f]}),a),null!==O&&(j[g[f]]=O,v=!0);if(v)return{schema:j}}for(m in $)$.hasOwnProperty(m)&&!i.hasOwnProperty(m)&&("format"===m?e.fieldFormat.hasOwnProperty($[m])&&!e.fieldFormat[$[m]](I,$,o,a)&&(j[m]=!0,v=!0):e.fieldValidate.hasOwnProperty(m)&&!e.fieldValidate[m](I,$[m].hasOwnProperty("$data")?c(o,$[m].$data):$[m],$,o,a)&&(j[m]=!0,v=!0));return v?j:null},p={useDefault:!1,useCoerce:!1,checkRequired:!0,removeAdditional:!1};e.prototype={validate:function(e,t,r){var n=[e],i=null,o=[{object:{__root__:t},key:"__root__"}];if("string"==typeof e&&(n=u(this,null,e),!n))throw new Error("jjv: could not find schema '"+e+"'.");if(r)for(var a in this.defaultOptions)this.defaultOptions.hasOwnProperty(a)&&!r.hasOwnProperty(a)&&(r[a]=this.defaultOptions[a]);else r=this.defaultOptions;return i=l(this,n,o,r),i?{validation:i.hasOwnProperty("schema")?i.schema:i}:null},resolveRef:function(e,t){return u(this,e,t)},addType:function(e,t){this.fieldType[e]=t},addTypeCoercion:function(e,t){this.coerceType[e]=t},addCheck:function(e,t){this.fieldValidate[e]=t},addFormat:function(e,t){this.fieldFormat[e]=t},addSchema:function(e,t){if(!t&&e&&(t=e,e=void 0),t.hasOwnProperty("id")&&"string"==typeof t.id&&t.id!==e){if("/"===t.id.charAt(0))throw new Error("jjv: schema id's starting with / are invalid.");this.schema[s(t.id)]=t}else if(!e)throw new Error("jjv: schema needs either a name or id attribute.");e&&(this.schema[s(e)]=t)}},"undefined"!=typeof module&&"undefined"!=typeof module.exports?module.exports=e:"function"==typeof define&&define.amd?define(function(){return e}):this.jjv=e}).call(this);
},{}],6:[function(require,module,exports){
(function(){"use strict";function e(s){var i=[],n=Object.keys(s.validation),r=n.every(function(e){return"object"!=typeof s.validation[e]||t(s.validation[e])});return n.forEach(r?function(e){var a,n;try{switch(e){case"type":var r=typeof s.data;"number"===r&&(""+s.data).match(/^\d+$/)?r="integer":"object"===r&&Array.isArray(s.data)&&(r="array"),a={code:"INVALID_TYPE",message:"Invalid type: "+r+" should be "+(t(s.validation[e])?"one of ":"")+s.validation[e]};break;case"required":n=s.ns,a={code:"OBJECT_REQUIRED",message:"Missing required property: "+n[n.length-1]};break;case"minimum":a={code:"MINIMUM",message:"Value "+s.data+" is less than minimum "+s.schema.minimum};break;case"maximum":a={code:"MAXIMUM",message:"Value "+s.data+" is greater than maximum "+s.schema.maximum};break;case"multipleOf":a={code:"MULTIPLE_OF",message:"Value "+s.data+" is not a multiple of "+s.schema.multipleOf};break;case"pattern":a={code:"PATTERN",message:"String does not match pattern: "+s.schema.pattern};break;case"minLength":a={code:"MIN_LENGTH",message:"String is too short ("+s.data.length+" chars), minimum "+s.schema.minLength};break;case"maxLength":a={code:"MAX_LENGTH",message:"String is too long ("+s.data.length+" chars), maximum "+s.schema.maxLength};break;case"minItems":a={code:"ARRAY_LENGTH_SHORT",message:"Array is too short ("+s.data.length+"), minimum "+s.schema.minItems};break;case"maxItems":a={code:"ARRAY_LENGTH_LONG",message:"Array is too long ("+s.data.length+"), maximum "+s.schema.maxItems};break;case"uniqueItems":a={code:"ARRAY_UNIQUE",message:"Array items are not unique"};break;case"minProperties":a={code:"OBJECT_PROPERTIES_MINIMUM",message:"Too few properties defined ("+Object.keys(s.data).length+"), minimum "+s.schema.minProperties};break;case"maxProperties":a={code:"OBJECT_PROPERTIES_MAXIMUM",message:"Too many properties defined ("+Object.keys(s.data).length+"), maximum "+s.schema.maxProperties};break;case"enum":a={code:"ENUM_MISMATCH",message:"No enum match ("+s.data+"), expects: "+s.schema["enum"].join(", ")};break;case"not":a={code:"NOT_PASSED",message:'Data matches schema from "not"'};break;case"additional":n=s.ns,a={code:"ADDITIONAL_PROPERTIES",message:"Additional properties not allowed: "+n[n.length-1]}}}catch(o){}if(!a){a={code:"FAILED",message:"Validation error: "+e};try{"boolean"!=typeof s.validation[e]&&(a.message=" ("+s.validation[e]+")")}catch(o){}}a.code="VALIDATION_"+a.code,void 0!==s.data&&(a.data=s.data),a.path=s.ns,i.push(a)}:function(t){var n;s.schema.$ref&&(s.schema=s.schema.$ref.match(/#\/definitions\//)?s.definitions[s.schema.$ref.slice(14)]:s.schema.$ref,"string"==typeof s.schema&&(s.schema=s.env.resolveRef(null,s.schema),s.schema&&(s.schema=s.schema[0]))),s.schema&&s.schema.type&&(a(s.schema,"object")&&(s.schema.properties&&s.schema.properties[t]&&(n=s.schema.properties[t]),!n&&s.schema.patternProperties&&Object.keys(s.schema.patternProperties).some(function(e){return t.match(new RegExp(e))?(n=s.schema.patternProperties[e],!0):void 0}),!n&&s.schema.hasOwnProperty("additionalProperties")&&(n="boolean"==typeof s.schema.additionalProperties?{}:s.schema.additionalProperties)),a(s.schema,"array")&&(n=s.schema.items));var r={env:s.env,schema:n||{},ns:s.ns.concat(t)};try{r.data=s.data[t]}catch(o){}try{r.validation=s.validation[t].schema?s.validation[t].schema:s.validation[t]}catch(o){r.validation={}}try{r.definitions=n.definitions||s.definitions}catch(o){r.definitions=s.definitions}i=i.concat(e(r))}),i}function a(e,a){return"string"==typeof e.type?e.type===a:t(e.type)?-1!==e.type.indexOf(a):!1}function t(e){return"function"==typeof Array.isArray?Array.isArray(e):"[object Array]"===Object.prototype.toString.call(e)}function s(e){var a=e.hasOwnProperty("root")?e.root:"$",t=e.hasOwnProperty("sep")?e.sep:".";return function(e){var s=a;return e.path.forEach(function(e){s+=e.match(/^\d+$/)?"["+e+"]":e.match(/^[A-Z_$][0-9A-Z_$]*$/i)?t+e:"["+JSON.stringify(e)+"]"}),e.path=s,e}}function i(a){return function(t,i,n,r){if(!n||!n.validation)return[];r=r||{},"string"==typeof t&&(t=a.schema[t]);var o=e({env:a,schema:t,data:i,validation:n.validation,ns:[],definitions:t.definitions||{}});return o.length&&r.formatPath!==!1?o.map(s(r)):o}}"undefined"!=typeof module&&"undefined"!=typeof module.exports?module.exports=i:"function"==typeof define&&define.amd?define(function(){return i}):this.jjve=i}).call(this);
},{}],7:[function(require,module,exports){
(function(n){(function(){function t(n,t,r){for(var e=(r||0)-1,u=n?n.length:0;++e<u;)if(n[e]===t)return e;return-1}function r(n,r){var e=typeof r;if(n=n.cache,"boolean"==e||null==r)return n[r]?0:-1;"number"!=e&&"string"!=e&&(e="object");var u="number"==e?r:d+r;return n=(n=n[e])&&n[u],"object"==e?n&&t(n,r)>-1?0:-1:n?0:-1}function e(n){var t=this.cache,r=typeof n;if("boolean"==r||null==n)t[n]=!0;else{"number"!=r&&"string"!=r&&(r="object");var e="number"==r?n:d+n,u=t[r]||(t[r]={});"object"==r?(u[e]||(u[e]=[])).push(n):u[e]=!0}}function u(n){return n.charCodeAt(0)}function o(n,t){for(var r=n.criteria,e=t.criteria,u=-1,o=r.length;++u<o;){var a=r[u],i=e[u];if(a!==i){if(a>i||"undefined"==typeof a)return 1;if(i>a||"undefined"==typeof i)return-1}}return n.index-t.index}function a(n){var t=-1,r=n.length,u=n[0],o=n[r/2|0],a=n[r-1];if(u&&"object"==typeof u&&o&&"object"==typeof o&&a&&"object"==typeof a)return!1;var i=l();i["false"]=i["null"]=i["true"]=i.undefined=!1;var f=l();for(f.array=n,f.cache=i,f.push=e;++t<r;)f.push(n[t]);return f}function i(n){return"\\"+H[n]}function f(){return g.pop()||[]}function l(){return y.pop()||{array:null,cache:null,criteria:null,"false":!1,index:0,"null":!1,number:null,object:null,push:null,string:null,"true":!1,undefined:!1,value:null}}function c(n){n.length=0,g.length<_&&g.push(n)}function p(n){var t=n.cache;t&&p(t),n.array=n.cache=n.criteria=n.object=n.number=n.string=n.value=null,y.length<_&&y.push(n)}function s(n,t,r){t||(t=0),"undefined"==typeof r&&(r=n?n.length:0);for(var e=-1,u=r-t||0,o=Array(0>u?0:u);++e<u;)o[e]=n[t+e];return o}function v(n){function e(n){return n&&"object"==typeof n&&!Xe(n)&&De.call(n,"__wrapped__")?n:new g(n)}function g(n,t){this.__chain__=!!t,this.__wrapped__=n}function y(n){function t(){if(e){var n=s(e);Te.apply(n,arguments)}if(this instanceof t){var o=H(r.prototype),a=r.apply(o,n||arguments);return It(a)?a:o}return r.apply(u,n||arguments)}var r=n[0],e=n[2],u=n[4];return Qe(t,n),t}function _(n,t,r,e,u){if(r){var o=r(n);if("undefined"!=typeof o)return o}var a=It(n);if(!a)return n;var i=Oe.call(n);if(!U[i])return n;var l=He[i];switch(i){case B:case W:return new l(+n);case z:case K:return new l(n);case P:return o=l(n.source,O.exec(n)),o.lastIndex=n.lastIndex,o}var p=Xe(n);if(t){var v=!e;e||(e=f()),u||(u=f());for(var h=e.length;h--;)if(e[h]==n)return u[h];o=p?l(n.length):{}}else o=p?s(n):uu({},n);return p&&(De.call(n,"index")&&(o.index=n.index),De.call(n,"input")&&(o.input=n.input)),t?(e.push(n),u.push(o),(p?Qt:iu)(n,function(n,a){o[a]=_(n,t,r,e,u)}),v&&(c(e),c(u)),o):o}function H(n){return It(n)?qe(n):{}}function Q(n,t,r){if("function"!=typeof n)return Xr;if("undefined"==typeof t||!("prototype"in n))return n;var e=n.__bindData__;if("undefined"==typeof e&&(Je.funcNames&&(e=!n.name),e=e||!Je.funcDecomp,!e)){var u=Se.call(n);Je.funcNames||(e=!N.test(u)),e||(e=S.test(u),Qe(n,e))}if(e===!1||e!==!0&&1&e[1])return n;switch(r){case 1:return function(r){return n.call(t,r)};case 2:return function(r,e){return n.call(t,r,e)};case 3:return function(r,e,u){return n.call(t,r,e,u)};case 4:return function(r,e,u,o){return n.call(t,r,e,u,o)}}return Tr(n,t)}function X(n){function t(){var n=f?a:this;if(u){var h=s(u);Te.apply(h,arguments)}if((o||c)&&(h||(h=s(arguments)),o&&Te.apply(h,o),c&&h.length<i))return e|=16,X([r,p?e:-4&e,h,null,a,i]);if(h||(h=arguments),l&&(r=n[v]),this instanceof t){n=H(r.prototype);var g=r.apply(n,h);return It(g)?g:n}return r.apply(n,h)}var r=n[0],e=n[1],u=n[2],o=n[3],a=n[4],i=n[5],f=1&e,l=2&e,c=4&e,p=8&e,v=r;return Qe(t,n),t}function Y(n,e){var u=-1,o=ft(),i=n?n.length:0,f=i>=b&&o===t,l=[];if(f){var c=a(e);c?(o=r,e=c):f=!1}for(;++u<i;){var s=n[u];o(e,s)<0&&l.push(s)}return f&&p(e),l}function Z(n,t,r,e){for(var u=(e||0)-1,o=n?n.length:0,a=[];++u<o;){var i=n[u];if(i&&"object"==typeof i&&"number"==typeof i.length&&(Xe(i)||st(i))){t||(i=Z(i,t,r));var f=-1,l=i.length,c=a.length;for(a.length+=l;++f<l;)a[c++]=i[f]}else r||a.push(i)}return a}function tt(n,t,r,e,u,o){if(r){var a=r(n,t);if("undefined"!=typeof a)return!!a}if(n===t)return 0!==n||1/n==1/t;var i=typeof n,l=typeof t;if(!(n!==n||n&&G[i]||t&&G[l]))return!1;if(null==n||null==t)return n===t;var p=Oe.call(n),s=Oe.call(t);if(p==$&&(p=L),s==$&&(s=L),p!=s)return!1;switch(p){case B:case W:return+n==+t;case z:return n!=+n?t!=+t:0==n?1/n==1/t:n==+t;case P:case K:return n==we(t)}var v=p==F;if(!v){var h=De.call(n,"__wrapped__"),g=De.call(t,"__wrapped__");if(h||g)return tt(h?n.__wrapped__:n,g?t.__wrapped__:t,r,e,u,o);if(p!=L)return!1;var y=n.constructor,m=t.constructor;if(y!=m&&!(Et(y)&&y instanceof y&&Et(m)&&m instanceof m)&&"constructor"in n&&"constructor"in t)return!1}var d=!u;u||(u=f()),o||(o=f());for(var b=u.length;b--;)if(u[b]==n)return o[b]==t;var _=0;if(a=!0,u.push(n),o.push(t),v){if(b=n.length,_=t.length,a=_==b,a||e)for(;_--;){var w=b,j=t[_];if(e)for(;w--&&!(a=tt(n[w],j,r,e,u,o)););else if(!(a=tt(n[_],j,r,e,u,o)))break}}else au(t,function(t,i,f){return De.call(f,i)?(_++,a=De.call(n,i)&&tt(n[i],t,r,e,u,o)):void 0}),a&&!e&&au(n,function(n,t,r){return De.call(r,t)?a=--_>-1:void 0});return u.pop(),o.pop(),d&&(c(u),c(o)),a}function rt(n,t,r,e,u){(Xe(t)?Qt:iu)(t,function(t,o){var a,i,f=t,l=n[o];if(t&&((i=Xe(t))||fu(t))){for(var c=e.length;c--;)if(a=e[c]==t){l=u[c];break}if(!a){var p;r&&(f=r(l,t),(p="undefined"!=typeof f)&&(l=f)),p||(l=i?Xe(l)?l:[]:fu(l)?l:{}),e.push(t),u.push(l),p||rt(l,t,r,e,u)}}else r&&(f=r(l,t),"undefined"==typeof f&&(f=t)),"undefined"!=typeof f&&(l=f);n[o]=l})}function et(n,t){return n+Ie(Ge()*(t-n+1))}function ut(n,e,u){var o=-1,i=ft(),l=n?n.length:0,s=[],v=!e&&l>=b&&i===t,h=u||v?f():s;if(v){var g=a(h);i=r,h=g}for(;++o<l;){var y=n[o],m=u?u(y,o,n):y;(e?!o||h[h.length-1]!==m:i(h,m)<0)&&((u||v)&&h.push(m),s.push(y))}return v?(c(h.array),p(h)):u&&c(h),s}function ot(n){return function(t,r,u){var o={};r=e.createCallback(r,u,3);var a=-1,i=t?t.length:0;if("number"==typeof i)for(;++a<i;){var f=t[a];n(o,f,r(f,a,t),t)}else iu(t,function(t,e,u){n(o,t,r(t,e,u),u)});return o}}function at(n,t,r,e,u,o){var a=1&t,i=2&t,f=4&t,l=16&t,c=32&t;if(!i&&!Et(n))throw new je;l&&!r.length&&(t&=-17,l=r=!1),c&&!e.length&&(t&=-33,c=e=!1);var p=n&&n.__bindData__;if(p&&p!==!0)return p=s(p),p[2]&&(p[2]=s(p[2])),p[3]&&(p[3]=s(p[3])),!a||1&p[1]||(p[4]=u),!a&&1&p[1]&&(t|=8),!f||4&p[1]||(p[5]=o),l&&Te.apply(p[2]||(p[2]=[]),r),c&&Be.apply(p[3]||(p[3]=[]),e),p[1]|=t,at.apply(null,p);var v=1==t||17===t?y:X;return v([n,t,r,e,u,o])}function it(n){return nu[n]}function ft(){var n=(n=e.indexOf)===mr?t:n;return n}function lt(n){return"function"==typeof n&&Ne.test(n)}function ct(n){var t,r;return n&&Oe.call(n)==L&&(t=n.constructor,!Et(t)||t instanceof t)?(au(n,function(n,t){r=t}),"undefined"==typeof r||De.call(n,r)):!1}function pt(n){return tu[n]}function st(n){return n&&"object"==typeof n&&"number"==typeof n.length&&Oe.call(n)==$||!1}function vt(n,t,r,e){return"boolean"!=typeof t&&null!=t&&(e=r,r=t,t=!1),_(n,t,"function"==typeof r&&Q(r,e,1))}function ht(n,t,r){return _(n,!0,"function"==typeof t&&Q(t,r,1))}function gt(n,t){var r=H(n);return t?uu(r,t):r}function yt(n,t,r){var u;return t=e.createCallback(t,r,3),iu(n,function(n,r,e){return t(n,r,e)?(u=r,!1):void 0}),u}function mt(n,t,r){var u;return t=e.createCallback(t,r,3),bt(n,function(n,r,e){return t(n,r,e)?(u=r,!1):void 0}),u}function dt(n,t,r){var e=[];au(n,function(n,t){e.push(t,n)});var u=e.length;for(t=Q(t,r,3);u--&&t(e[u--],e[u],n)!==!1;);return n}function bt(n,t,r){var e=Ze(n),u=e.length;for(t=Q(t,r,3);u--;){var o=e[u];if(t(n[o],o,n)===!1)break}return n}function _t(n){var t=[];return au(n,function(n,r){Et(n)&&t.push(r)}),t.sort()}function wt(n,t){return n?De.call(n,t):!1}function jt(n){for(var t=-1,r=Ze(n),e=r.length,u={};++t<e;){var o=r[t];u[n[o]]=o}return u}function kt(n){return n===!0||n===!1||n&&"object"==typeof n&&Oe.call(n)==B||!1}function xt(n){return n&&"object"==typeof n&&Oe.call(n)==W||!1}function Ct(n){return n&&1===n.nodeType||!1}function Ot(n){var t=!0;if(!n)return t;var r=Oe.call(n),e=n.length;return r==F||r==K||r==$||r==L&&"number"==typeof e&&Et(n.splice)?!e:(iu(n,function(){return t=!1}),t)}function Nt(n,t,r,e){return tt(n,t,"function"==typeof r&&Q(r,e,2))}function Rt(n){return Le(n)&&!Pe(parseFloat(n))}function Et(n){return"function"==typeof n}function It(n){return!(!n||!G[typeof n])}function St(n){return Dt(n)&&n!=+n}function At(n){return null===n}function Dt(n){return"number"==typeof n||n&&"object"==typeof n&&Oe.call(n)==z||!1}function Tt(n){return n&&"object"==typeof n&&Oe.call(n)==P||!1}function $t(n){return"string"==typeof n||n&&"object"==typeof n&&Oe.call(n)==K||!1}function Ft(n){return"undefined"==typeof n}function Bt(n,t,r){var u={};return t=e.createCallback(t,r,3),iu(n,function(n,r,e){u[r]=t(n,r,e)}),u}function Wt(n){var t=arguments,r=2;if(!It(n))return n;if("number"!=typeof t[2]&&(r=t.length),r>3&&"function"==typeof t[r-2])var e=Q(t[--r-1],t[r--],2);else r>2&&"function"==typeof t[r-1]&&(e=t[--r]);for(var u=s(arguments,1,r),o=-1,a=f(),i=f();++o<r;)rt(n,u[o],e,a,i);return c(a),c(i),n}function qt(n,t,r){var u={};if("function"!=typeof t){var o=[];au(n,function(n,t){o.push(t)}),o=Y(o,Z(arguments,!0,!1,1));for(var a=-1,i=o.length;++a<i;){var f=o[a];u[f]=n[f]}}else t=e.createCallback(t,r,3),au(n,function(n,r,e){t(n,r,e)||(u[r]=n)});return u}function zt(n){for(var t=-1,r=Ze(n),e=r.length,u=ve(e);++t<e;){var o=r[t];u[t]=[o,n[o]]}return u}function Lt(n,t,r){var u={};if("function"!=typeof t)for(var o=-1,a=Z(arguments,!0,!1,1),i=It(n)?a.length:0;++o<i;){var f=a[o];f in n&&(u[f]=n[f])}else t=e.createCallback(t,r,3),au(n,function(n,r,e){t(n,r,e)&&(u[r]=n)});return u}function Pt(n,t,r,u){var o=Xe(n);if(null==r)if(o)r=[];else{var a=n&&n.constructor,i=a&&a.prototype;r=H(i)}return t&&(t=e.createCallback(t,u,4),(o?Qt:iu)(n,function(n,e,u){return t(r,n,e,u)})),r}function Kt(n){for(var t=-1,r=Ze(n),e=r.length,u=ve(e);++t<e;)u[t]=n[r[t]];return u}function Ut(n){for(var t=arguments,r=-1,e=Z(t,!0,!1,1),u=t[2]&&t[2][t[1]]===n?1:e.length,o=ve(u);++r<u;)o[r]=n[e[r]];return o}function Mt(n,t,r){var e=-1,u=ft(),o=n?n.length:0,a=!1;return r=(0>r?Ue(0,o+r):r)||0,Xe(n)?a=u(n,t,r)>-1:"number"==typeof o?a=($t(n)?n.indexOf(t,r):u(n,t,r))>-1:iu(n,function(n){return++e>=r?!(a=n===t):void 0}),a}function Vt(n,t,r){var u=!0;t=e.createCallback(t,r,3);var o=-1,a=n?n.length:0;if("number"==typeof a)for(;++o<a&&(u=!!t(n[o],o,n)););else iu(n,function(n,r,e){return u=!!t(n,r,e)});return u}function Gt(n,t,r){var u=[];t=e.createCallback(t,r,3);var o=-1,a=n?n.length:0;if("number"==typeof a)for(;++o<a;){var i=n[o];t(i,o,n)&&u.push(i)}else iu(n,function(n,r,e){t(n,r,e)&&u.push(n)});return u}function Ht(n,t,r){t=e.createCallback(t,r,3);var u=-1,o=n?n.length:0;if("number"!=typeof o){var a;return iu(n,function(n,r,e){return t(n,r,e)?(a=n,!1):void 0}),a}for(;++u<o;){var i=n[u];if(t(i,u,n))return i}}function Jt(n,t,r){var u;return t=e.createCallback(t,r,3),Xt(n,function(n,r,e){return t(n,r,e)?(u=n,!1):void 0}),u}function Qt(n,t,r){var e=-1,u=n?n.length:0;if(t=t&&"undefined"==typeof r?t:Q(t,r,3),"number"==typeof u)for(;++e<u&&t(n[e],e,n)!==!1;);else iu(n,t);return n}function Xt(n,t,r){var e=n?n.length:0;if(t=t&&"undefined"==typeof r?t:Q(t,r,3),"number"==typeof e)for(;e--&&t(n[e],e,n)!==!1;);else{var u=Ze(n);e=u.length,iu(n,function(n,r,o){return r=u?u[--e]:--e,t(o[r],r,o)})}return n}function Yt(n,t){var r=s(arguments,2),e=-1,u="function"==typeof t,o=n?n.length:0,a=ve("number"==typeof o?o:0);return Qt(n,function(n){a[++e]=(u?t:n[t]).apply(n,r)}),a}function Zt(n,t,r){var u=-1,o=n?n.length:0;if(t=e.createCallback(t,r,3),"number"==typeof o)for(var a=ve(o);++u<o;)a[u]=t(n[u],u,n);else a=[],iu(n,function(n,r,e){a[++u]=t(n,r,e)});return a}function nr(n,t,r){var o=-1/0,a=o;if("function"!=typeof t&&r&&r[t]===n&&(t=null),null==t&&Xe(n))for(var i=-1,f=n.length;++i<f;){var l=n[i];l>a&&(a=l)}else t=null==t&&$t(n)?u:e.createCallback(t,r,3),Qt(n,function(n,r,e){var u=t(n,r,e);u>o&&(o=u,a=n)});return a}function tr(n,t,r){var o=1/0,a=o;if("function"!=typeof t&&r&&r[t]===n&&(t=null),null==t&&Xe(n))for(var i=-1,f=n.length;++i<f;){var l=n[i];a>l&&(a=l)}else t=null==t&&$t(n)?u:e.createCallback(t,r,3),Qt(n,function(n,r,e){var u=t(n,r,e);o>u&&(o=u,a=n)});return a}function rr(n,t,r,u){if(!n)return r;var o=arguments.length<3;t=e.createCallback(t,u,4);var a=-1,i=n.length;if("number"==typeof i)for(o&&(r=n[++a]);++a<i;)r=t(r,n[a],a,n);else iu(n,function(n,e,u){r=o?(o=!1,n):t(r,n,e,u)});return r}function er(n,t,r,u){var o=arguments.length<3;return t=e.createCallback(t,u,4),Xt(n,function(n,e,u){r=o?(o=!1,n):t(r,n,e,u)}),r}function ur(n,t,r){return t=e.createCallback(t,r,3),Gt(n,function(n,r,e){return!t(n,r,e)})}function or(n,t,r){if(n&&"number"!=typeof n.length&&(n=Kt(n)),null==t||r)return n?n[et(0,n.length-1)]:h;var e=ar(n);return e.length=Me(Ue(0,t),e.length),e}function ar(n){var t=-1,r=n?n.length:0,e=ve("number"==typeof r?r:0);return Qt(n,function(n){var r=et(0,++t);e[t]=e[r],e[r]=n}),e}function ir(n){var t=n?n.length:0;return"number"==typeof t?t:Ze(n).length}function fr(n,t,r){var u;t=e.createCallback(t,r,3);var o=-1,a=n?n.length:0;if("number"==typeof a)for(;++o<a&&!(u=t(n[o],o,n)););else iu(n,function(n,r,e){return!(u=t(n,r,e))});return!!u}function lr(n,t,r){var u=-1,a=Xe(t),i=n?n.length:0,s=ve("number"==typeof i?i:0);for(a||(t=e.createCallback(t,r,3)),Qt(n,function(n,r,e){var o=s[++u]=l();a?o.criteria=Zt(t,function(t){return n[t]}):(o.criteria=f())[0]=t(n,r,e),o.index=u,o.value=n}),i=s.length,s.sort(o);i--;){var v=s[i];s[i]=v.value,a||c(v.criteria),p(v)}return s}function cr(n){return n&&"number"==typeof n.length?s(n):Kt(n)}function pr(n){for(var t=-1,r=n?n.length:0,e=[];++t<r;){var u=n[t];u&&e.push(u)}return e}function sr(n){return Y(n,Z(arguments,!0,!0,1))}function vr(n,t,r){var u=-1,o=n?n.length:0;for(t=e.createCallback(t,r,3);++u<o;)if(t(n[u],u,n))return u;return-1}function hr(n,t,r){var u=n?n.length:0;for(t=e.createCallback(t,r,3);u--;)if(t(n[u],u,n))return u;return-1}function gr(n,t,r){var u=0,o=n?n.length:0;if("number"!=typeof t&&null!=t){var a=-1;for(t=e.createCallback(t,r,3);++a<o&&t(n[a],a,n);)u++}else if(u=t,null==u||r)return n?n[0]:h;return s(n,0,Me(Ue(0,u),o))}function yr(n,t,r,e){return"boolean"!=typeof t&&null!=t&&(e=r,r="function"!=typeof t&&e&&e[t]===n?null:t,t=!1),null!=r&&(n=Zt(n,r,e)),Z(n,t)}function mr(n,r,e){if("number"==typeof e){var u=n?n.length:0;e=0>e?Ue(0,u+e):e||0}else if(e){var o=Or(n,r);return n[o]===r?o:-1}return t(n,r,e)}function dr(n,t,r){var u=0,o=n?n.length:0;if("number"!=typeof t&&null!=t){var a=o;for(t=e.createCallback(t,r,3);a--&&t(n[a],a,n);)u++}else u=null==t||r?1:t||u;return s(n,0,Me(Ue(0,o-u),o))}function br(){for(var n=[],e=-1,u=arguments.length,o=f(),i=ft(),l=i===t,s=f();++e<u;){var v=arguments[e];(Xe(v)||st(v))&&(n.push(v),o.push(l&&v.length>=b&&a(e?n[e]:s)))}var h=n[0],g=-1,y=h?h.length:0,m=[];n:for(;++g<y;){var d=o[0];if(v=h[g],(d?r(d,v):i(s,v))<0){for(e=u,(d||s).push(v);--e;)if(d=o[e],(d?r(d,v):i(n[e],v))<0)continue n;m.push(v)}}for(;u--;)d=o[u],d&&p(d);return c(o),c(s),m}function _r(n,t,r){var u=0,o=n?n.length:0;if("number"!=typeof t&&null!=t){var a=o;for(t=e.createCallback(t,r,3);a--&&t(n[a],a,n);)u++}else if(u=t,null==u||r)return n?n[o-1]:h;return s(n,Ue(0,o-u))}function wr(n,t,r){var e=n?n.length:0;for("number"==typeof r&&(e=(0>r?Ue(0,e+r):Me(r,e-1))+1);e--;)if(n[e]===t)return e;return-1}function jr(n){for(var t=arguments,r=0,e=t.length,u=n?n.length:0;++r<e;)for(var o=-1,a=t[r];++o<u;)n[o]===a&&(Fe.call(n,o--,1),u--);return n}function kr(n,t,r){n=+n||0,r="number"==typeof r?r:+r||1,null==t&&(t=n,n=0);for(var e=-1,u=Ue(0,Re((t-n)/(r||1))),o=ve(u);++e<u;)o[e]=n,n+=r;return o}function xr(n,t,r){var u=-1,o=n?n.length:0,a=[];for(t=e.createCallback(t,r,3);++u<o;){var i=n[u];t(i,u,n)&&(a.push(i),Fe.call(n,u--,1),o--)}return a}function Cr(n,t,r){if("number"!=typeof t&&null!=t){var u=0,o=-1,a=n?n.length:0;for(t=e.createCallback(t,r,3);++o<a&&t(n[o],o,n);)u++}else u=null==t||r?1:Ue(0,t);return s(n,u)}function Or(n,t,r,u){var o=0,a=n?n.length:o;for(r=r?e.createCallback(r,u,1):Xr,t=r(t);a>o;){var i=o+a>>>1;r(n[i])<t?o=i+1:a=i}return o}function Nr(){return ut(Z(arguments,!0,!0))}function Rr(n,t,r,u){return"boolean"!=typeof t&&null!=t&&(u=r,r="function"!=typeof t&&u&&u[t]===n?null:t,t=!1),null!=r&&(r=e.createCallback(r,u,3)),ut(n,t,r)}function Er(n){return Y(n,s(arguments,1))}function Ir(){for(var n=-1,t=arguments.length;++n<t;){var r=arguments[n];if(Xe(r)||st(r))var e=e?ut(Y(e,r).concat(Y(r,e))):r}return e||[]}function Sr(){for(var n=arguments.length>1?arguments:arguments[0],t=-1,r=n?nr(su(n,"length")):0,e=ve(0>r?0:r);++t<r;)e[t]=su(n,t);return e}function Ar(n,t){var r=-1,e=n?n.length:0,u={};for(t||!e||Xe(n[0])||(t=[]);++r<e;){var o=n[r];t?u[o]=t[r]:o&&(u[o[0]]=o[1])}return u}function Dr(n,t){if(!Et(t))throw new je;return function(){return--n<1?t.apply(this,arguments):void 0}}function Tr(n,t){return arguments.length>2?at(n,17,s(arguments,2),null,t):at(n,1,null,null,t)}function $r(n){for(var t=arguments.length>1?Z(arguments,!0,!1,1):_t(n),r=-1,e=t.length;++r<e;){var u=t[r];n[u]=at(n[u],1,null,null,n)}return n}function Fr(n,t){return arguments.length>2?at(t,19,s(arguments,2),null,n):at(t,3,null,null,n)}function Br(){for(var n=arguments,t=n.length;t--;)if(!Et(n[t]))throw new je;return function(){for(var t=arguments,r=n.length;r--;)t=[n[r].apply(this,t)];return t[0]}}function Wr(n,t){return t="number"==typeof t?t:+t||n.length,at(n,4,null,null,null,t)}function qr(n,t,r){var e,u,o,a,i,f,l,c=0,p=!1,s=!0;if(!Et(n))throw new je;if(t=Ue(0,t)||0,r===!0){var v=!0;s=!1}else It(r)&&(v=r.leading,p="maxWait"in r&&(Ue(t,r.maxWait)||0),s="trailing"in r?r.trailing:s);var g=function(){var r=t-(hu()-a);if(0>=r){u&&Ee(u);var p=l;u=f=l=h,p&&(c=hu(),o=n.apply(i,e),f||u||(e=i=null))}else f=$e(g,r)},y=function(){f&&Ee(f),u=f=l=h,(s||p!==t)&&(c=hu(),o=n.apply(i,e),f||u||(e=i=null))};return function(){if(e=arguments,a=hu(),i=this,l=s&&(f||!v),p===!1)var r=v&&!f;else{u||v||(c=a);var h=p-(a-c),m=0>=h;m?(u&&(u=Ee(u)),c=a,o=n.apply(i,e)):u||(u=$e(y,h))}return m&&f?f=Ee(f):f||t===p||(f=$e(g,t)),r&&(m=!0,o=n.apply(i,e)),!m||f||u||(e=i=null),o}}function zr(n){if(!Et(n))throw new je;var t=s(arguments,1);return $e(function(){n.apply(h,t)},1)}function Lr(n,t){if(!Et(n))throw new je;var r=s(arguments,2);return $e(function(){n.apply(h,r)},t)}function Pr(n,t){if(!Et(n))throw new je;var r=function(){var e=r.cache,u=t?t.apply(this,arguments):d+arguments[0];return De.call(e,u)?e[u]:e[u]=n.apply(this,arguments)};return r.cache={},r}function Kr(n){var t,r;if(!Et(n))throw new je;return function(){return t?r:(t=!0,r=n.apply(this,arguments),n=null,r)}}function Ur(n){return at(n,16,s(arguments,1))}function Mr(n){return at(n,32,null,s(arguments,1))}function Vr(n,t,r){var e=!0,u=!0;if(!Et(n))throw new je;return r===!1?e=!1:It(r)&&(e="leading"in r?r.leading:e,u="trailing"in r?r.trailing:u),M.leading=e,M.maxWait=t,M.trailing=u,qr(n,t,M)}function Gr(n,t){return at(t,16,[n])}function Hr(n){return function(){return n}}function Jr(n,t,r){var e=typeof n;if(null==n||"function"==e)return Q(n,t,r);if("object"!=e)return te(n);var u=Ze(n),o=u[0],a=n[o];return 1!=u.length||a!==a||It(a)?function(t){for(var r=u.length,e=!1;r--&&(e=tt(t[u[r]],n[u[r]],null,!0)););return e}:function(n){var t=n[o];return a===t&&(0!==a||1/a==1/t)}}function Qr(n){return null==n?"":we(n).replace(eu,it)}function Xr(n){return n}function Yr(n,t,r){var u=!0,o=t&&_t(t);t&&(r||o.length)||(null==r&&(r=t),a=g,t=n,n=e,o=_t(t)),r===!1?u=!1:It(r)&&"chain"in r&&(u=r.chain);var a=n,i=Et(a);Qt(o,function(r){var e=n[r]=t[r];i&&(a.prototype[r]=function(){var t=this.__chain__,r=this.__wrapped__,o=[r];Te.apply(o,arguments);var i=e.apply(n,o);if(u||t){if(r===i&&It(i))return this;i=new a(i),i.__chain__=t}return i})})}function Zr(){return n._=Ce,this}function ne(){}function te(n){return function(t){return t[n]}}function re(n,t,r){var e=null==n,u=null==t;if(null==r&&("boolean"==typeof n&&u?(r=n,n=1):u||"boolean"!=typeof t||(r=t,u=!0)),e&&u&&(t=1),n=+n||0,u?(t=n,n=0):t=+t||0,r||n%1||t%1){var o=Ge();return Me(n+o*(t-n+parseFloat("1e-"+((o+"").length-1))),t)}return et(n,t)}function ee(n,t){if(n){var r=n[t];return Et(r)?n[t]():r}}function ue(n,t,r){var u=e.templateSettings;n=we(n||""),r=ou({},r,u);var o,a=ou({},r.imports,u.imports),f=Ze(a),l=Kt(a),c=0,p=r.interpolate||I,s="__p += '",v=_e((r.escape||I).source+"|"+p.source+"|"+(p===R?C:I).source+"|"+(r.evaluate||I).source+"|$","g");n.replace(v,function(t,r,e,u,a,f){return e||(e=u),s+=n.slice(c,f).replace(A,i),r&&(s+="' +\n__e("+r+") +\n'"),a&&(o=!0,s+="';\n"+a+";\n__p += '"),e&&(s+="' +\n((__t = ("+e+")) == null ? '' : __t) +\n'"),c=f+t.length,t}),s+="';\n";var g=r.variable,y=g;y||(g="obj",s="with ("+g+") {\n"+s+"\n}\n"),s=(o?s.replace(j,""):s).replace(k,"$1").replace(x,"$1;"),s="function("+g+") {\n"+(y?"":g+" || ("+g+" = {});\n")+"var __t, __p = '', __e = _.escape"+(o?", __j = Array.prototype.join;\nfunction print() { __p += __j.call(arguments, '') }\n":";\n")+s+"return __p\n}";var m="\n/*\n//# sourceURL="+(r.sourceURL||"/lodash/template/source["+T++ +"]")+"\n*/";try{var d=ye(f,"return "+s+m).apply(h,l)}catch(b){throw b.source=s,b}return t?d(t):(d.source=s,d)}function oe(n,t,r){n=(n=+n)>-1?n:0;var e=-1,u=ve(n);for(t=Q(t,r,1);++e<n;)u[e]=t(e);return u}function ae(n){return null==n?"":we(n).replace(ru,pt)}function ie(n){var t=++m;return we(null==n?"":n)+t}function fe(n){return n=new g(n),n.__chain__=!0,n}function le(n,t){return t(n),n}function ce(){return this.__chain__=!0,this}function pe(){return we(this.__wrapped__)}function se(){return this.__wrapped__}n=n?nt.defaults(J.Object(),n,nt.pick(J,D)):J;var ve=n.Array,he=n.Boolean,ge=n.Date,ye=n.Function,me=n.Math,de=n.Number,be=n.Object,_e=n.RegExp,we=n.String,je=n.TypeError,ke=[],xe=be.prototype,Ce=n._,Oe=xe.toString,Ne=_e("^"+we(Oe).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$"),Re=me.ceil,Ee=n.clearTimeout,Ie=me.floor,Se=ye.prototype.toString,Ae=lt(Ae=be.getPrototypeOf)&&Ae,De=xe.hasOwnProperty,Te=ke.push,$e=n.setTimeout,Fe=ke.splice,Be=ke.unshift,We=function(){try{var n={},t=lt(t=be.defineProperty)&&t,r=t(n,n,n)&&t}catch(e){}return r}(),qe=lt(qe=be.create)&&qe,ze=lt(ze=ve.isArray)&&ze,Le=n.isFinite,Pe=n.isNaN,Ke=lt(Ke=be.keys)&&Ke,Ue=me.max,Me=me.min,Ve=n.parseInt,Ge=me.random,He={};He[F]=ve,He[B]=he,He[W]=ge,He[q]=ye,He[L]=be,He[z]=de,He[P]=_e,He[K]=we,g.prototype=e.prototype;var Je=e.support={};Je.funcDecomp=!lt(n.WinRTError)&&S.test(v),Je.funcNames="string"==typeof ye.name,e.templateSettings={escape:/<%-([\s\S]+?)%>/g,evaluate:/<%([\s\S]+?)%>/g,interpolate:R,variable:"",imports:{_:e}},qe||(H=function(){function t(){}return function(r){if(It(r)){t.prototype=r;var e=new t;t.prototype=null}return e||n.Object()}}());var Qe=We?function(n,t){V.value=t,We(n,"__bindData__",V)}:ne,Xe=ze||function(n){return n&&"object"==typeof n&&"number"==typeof n.length&&Oe.call(n)==F||!1},Ye=function(n){var t,r=n,e=[];if(!r)return e;if(!G[typeof n])return e;for(t in r)De.call(r,t)&&e.push(t);return e},Ze=Ke?function(n){return It(n)?Ke(n):[]}:Ye,nu={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},tu=jt(nu),ru=_e("("+Ze(tu).join("|")+")","g"),eu=_e("["+Ze(nu).join("")+"]","g"),uu=function(n,t,r){var e,u=n,o=u;if(!u)return o;var a=arguments,i=0,f="number"==typeof r?2:a.length;if(f>3&&"function"==typeof a[f-2])var l=Q(a[--f-1],a[f--],2);else f>2&&"function"==typeof a[f-1]&&(l=a[--f]);for(;++i<f;)if(u=a[i],u&&G[typeof u])for(var c=-1,p=G[typeof u]&&Ze(u),s=p?p.length:0;++c<s;)e=p[c],o[e]=l?l(o[e],u[e]):u[e];return o},ou=function(n,t,r){var e,u=n,o=u;if(!u)return o;for(var a=arguments,i=0,f="number"==typeof r?2:a.length;++i<f;)if(u=a[i],u&&G[typeof u])for(var l=-1,c=G[typeof u]&&Ze(u),p=c?c.length:0;++l<p;)e=c[l],"undefined"==typeof o[e]&&(o[e]=u[e]);return o},au=function(n,t,r){var e,u=n,o=u;if(!u)return o;if(!G[typeof u])return o;t=t&&"undefined"==typeof r?t:Q(t,r,3);for(e in u)if(t(u[e],e,n)===!1)return o;return o},iu=function(n,t,r){var e,u=n,o=u;if(!u)return o;if(!G[typeof u])return o;t=t&&"undefined"==typeof r?t:Q(t,r,3);for(var a=-1,i=G[typeof u]&&Ze(u),f=i?i.length:0;++a<f;)if(e=i[a],t(u[e],e,n)===!1)return o;return o},fu=Ae?function(n){if(!n||Oe.call(n)!=L)return!1;var t=n.valueOf,r=lt(t)&&(r=Ae(t))&&Ae(r);return r?n==r||Ae(n)==r:ct(n)}:ct,lu=ot(function(n,t,r){De.call(n,r)?n[r]++:n[r]=1}),cu=ot(function(n,t,r){(De.call(n,r)?n[r]:n[r]=[]).push(t)}),pu=ot(function(n,t,r){n[r]=t}),su=Zt,vu=Gt,hu=lt(hu=ge.now)&&hu||function(){return(new ge).getTime()},gu=8==Ve(w+"08")?Ve:function(n,t){return Ve($t(n)?n.replace(E,""):n,t||0)};return e.after=Dr,e.assign=uu,e.at=Ut,e.bind=Tr,e.bindAll=$r,e.bindKey=Fr,e.chain=fe,e.compact=pr,e.compose=Br,e.constant=Hr,e.countBy=lu,e.create=gt,e.createCallback=Jr,e.curry=Wr,e.debounce=qr,e.defaults=ou,e.defer=zr,e.delay=Lr,e.difference=sr,e.filter=Gt,e.flatten=yr,e.forEach=Qt,e.forEachRight=Xt,e.forIn=au,e.forInRight=dt,e.forOwn=iu,e.forOwnRight=bt,e.functions=_t,e.groupBy=cu,e.indexBy=pu,e.initial=dr,e.intersection=br,e.invert=jt,e.invoke=Yt,e.keys=Ze,e.map=Zt,e.mapValues=Bt,e.max=nr,e.memoize=Pr,e.merge=Wt,e.min=tr,e.omit=qt,e.once=Kr,e.pairs=zt,e.partial=Ur,e.partialRight=Mr,e.pick=Lt,e.pluck=su,e.property=te,e.pull=jr,e.range=kr,e.reject=ur,e.remove=xr,e.rest=Cr,e.shuffle=ar,e.sortBy=lr,e.tap=le,e.throttle=Vr,e.times=oe,e.toArray=cr,e.transform=Pt,e.union=Nr,e.uniq=Rr,e.values=Kt,e.where=vu,e.without=Er,e.wrap=Gr,e.xor=Ir,e.zip=Sr,e.zipObject=Ar,e.collect=Zt,e.drop=Cr,e.each=Qt,e.eachRight=Xt,e.extend=uu,e.methods=_t,e.object=Ar,e.select=Gt,e.tail=Cr,e.unique=Rr,e.unzip=Sr,Yr(e),e.clone=vt,e.cloneDeep=ht,e.contains=Mt,e.escape=Qr,e.every=Vt,e.find=Ht,e.findIndex=vr,e.findKey=yt,e.findLast=Jt,e.findLastIndex=hr,e.findLastKey=mt,e.has=wt,e.identity=Xr,e.indexOf=mr,e.isArguments=st,e.isArray=Xe,e.isBoolean=kt,e.isDate=xt,e.isElement=Ct,e.isEmpty=Ot,e.isEqual=Nt,e.isFinite=Rt,e.isFunction=Et,e.isNaN=St,e.isNull=At,e.isNumber=Dt,e.isObject=It,e.isPlainObject=fu,e.isRegExp=Tt,e.isString=$t,e.isUndefined=Ft,e.lastIndexOf=wr,e.mixin=Yr,e.noConflict=Zr,e.noop=ne,e.now=hu,e.parseInt=gu,e.random=re,e.reduce=rr,e.reduceRight=er,e.result=ee,e.runInContext=v,e.size=ir,e.some=fr,e.sortedIndex=Or,e.template=ue,e.unescape=ae,e.uniqueId=ie,e.all=Vt,e.any=fr,e.detect=Ht,e.findWhere=Ht,e.foldl=rr,e.foldr=er,e.include=Mt,e.inject=rr,Yr(function(){var n={};return iu(e,function(t,r){e.prototype[r]||(n[r]=t)}),n}(),!1),e.first=gr,e.last=_r,e.sample=or,e.take=gr,e.head=gr,iu(e,function(n,t){var r="sample"!==t;e.prototype[t]||(e.prototype[t]=function(t,e){var u=this.__chain__,o=n(this.__wrapped__,t,e);return u||null!=t&&(!e||r&&"function"==typeof t)?new g(o,u):o})}),e.VERSION="2.4.1",e.prototype.chain=ce,e.prototype.toString=pe,e.prototype.value=se,e.prototype.valueOf=se,Qt(["join","pop","shift"],function(n){var t=ke[n];e.prototype[n]=function(){var n=this.__chain__,r=t.apply(this.__wrapped__,arguments);return n?new g(r,n):r}}),Qt(["push","reverse","sort","unshift"],function(n){var t=ke[n];e.prototype[n]=function(){return t.apply(this.__wrapped__,arguments),this}}),Qt(["concat","slice","splice"],function(n){var t=ke[n];e.prototype[n]=function(){return new g(t.apply(this.__wrapped__,arguments),this.__chain__)}}),e}var h,g=[],y=[],m=0,d=+new Date+"",b=75,_=40,w=" 	\f ﻿\n\r\u2028\u2029 ᠎             　",j=/\b__p \+= '';/g,k=/\b(__p \+=) '' \+/g,x=/(__e\(.*?\)|\b__t\)) \+\n'';/g,C=/\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g,O=/\w*$/,N=/^\s*function[ \n\r\t]+\w/,R=/<%=([\s\S]+?)%>/g,E=RegExp("^["+w+"]*0+(?=.$)"),I=/($^)/,S=/\bthis\b/,A=/['\n\r\t\u2028\u2029\\]/g,D=["Array","Boolean","Date","Function","Math","Number","Object","RegExp","String","_","attachEvent","clearTimeout","isFinite","isNaN","parseInt","setTimeout"],T=0,$="[object Arguments]",F="[object Array]",B="[object Boolean]",W="[object Date]",q="[object Function]",z="[object Number]",L="[object Object]",P="[object RegExp]",K="[object String]",U={};U[q]=!1,U[$]=U[F]=U[B]=U[W]=U[z]=U[L]=U[P]=U[K]=!0;var M={leading:!1,maxWait:0,trailing:!1},V={configurable:!1,enumerable:!1,value:null,writable:!1},G={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1},H={"\\":"\\","'":"'","\n":"n","\r":"r","	":"t","\u2028":"u2028","\u2029":"u2029"},J=G[typeof window]&&window||this,Q=G[typeof exports]&&exports&&!exports.nodeType&&exports,X=G[typeof module]&&module&&!module.nodeType&&module,Y=X&&X.exports===Q&&Q,Z=G[typeof n]&&n;!Z||Z.global!==Z&&Z.window!==Z||(J=Z);var nt=v();"function"==typeof define&&"object"==typeof define.amd&&define.amd?(J._=nt,define(function(){return nt})):Q&&X?Y?(X.exports=nt)._=nt:Q._=nt:J._=nt}).call(this)}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{});
},{}],8:[function(require,module,exports){
!function(t){if("object"==typeof exports)module.exports=t();else if("function"==typeof define&&define.amd)define(t);else{var r;try{r=window}catch(e){r=self}r.SparkMD5=t()}}(function(){"use strict";var t=function(t,r){return t+r&4294967295},r=function(r,e,n,i,f,o){return e=t(t(e,r),t(i,o)),t(e<<f|e>>>32-f,n)},e=function(t,e,n,i,f,o,s){return r(e&n|~e&i,t,e,f,o,s)},n=function(t,e,n,i,f,o,s){return r(e&i|n&~i,t,e,f,o,s)},i=function(t,e,n,i,f,o,s){return r(e^n^i,t,e,f,o,s)},f=function(t,e,n,i,f,o,s){return r(n^(e|~i),t,e,f,o,s)},o=function(r,o){var s=r[0],u=r[1],a=r[2],h=r[3];s=e(s,u,a,h,o[0],7,-680876936),h=e(h,s,u,a,o[1],12,-389564586),a=e(a,h,s,u,o[2],17,606105819),u=e(u,a,h,s,o[3],22,-1044525330),s=e(s,u,a,h,o[4],7,-176418897),h=e(h,s,u,a,o[5],12,1200080426),a=e(a,h,s,u,o[6],17,-1473231341),u=e(u,a,h,s,o[7],22,-45705983),s=e(s,u,a,h,o[8],7,1770035416),h=e(h,s,u,a,o[9],12,-1958414417),a=e(a,h,s,u,o[10],17,-42063),u=e(u,a,h,s,o[11],22,-1990404162),s=e(s,u,a,h,o[12],7,1804603682),h=e(h,s,u,a,o[13],12,-40341101),a=e(a,h,s,u,o[14],17,-1502002290),u=e(u,a,h,s,o[15],22,1236535329),s=n(s,u,a,h,o[1],5,-165796510),h=n(h,s,u,a,o[6],9,-1069501632),a=n(a,h,s,u,o[11],14,643717713),u=n(u,a,h,s,o[0],20,-373897302),s=n(s,u,a,h,o[5],5,-701558691),h=n(h,s,u,a,o[10],9,38016083),a=n(a,h,s,u,o[15],14,-660478335),u=n(u,a,h,s,o[4],20,-405537848),s=n(s,u,a,h,o[9],5,568446438),h=n(h,s,u,a,o[14],9,-1019803690),a=n(a,h,s,u,o[3],14,-187363961),u=n(u,a,h,s,o[8],20,1163531501),s=n(s,u,a,h,o[13],5,-1444681467),h=n(h,s,u,a,o[2],9,-51403784),a=n(a,h,s,u,o[7],14,1735328473),u=n(u,a,h,s,o[12],20,-1926607734),s=i(s,u,a,h,o[5],4,-378558),h=i(h,s,u,a,o[8],11,-2022574463),a=i(a,h,s,u,o[11],16,1839030562),u=i(u,a,h,s,o[14],23,-35309556),s=i(s,u,a,h,o[1],4,-1530992060),h=i(h,s,u,a,o[4],11,1272893353),a=i(a,h,s,u,o[7],16,-155497632),u=i(u,a,h,s,o[10],23,-1094730640),s=i(s,u,a,h,o[13],4,681279174),h=i(h,s,u,a,o[0],11,-358537222),a=i(a,h,s,u,o[3],16,-722521979),u=i(u,a,h,s,o[6],23,76029189),s=i(s,u,a,h,o[9],4,-640364487),h=i(h,s,u,a,o[12],11,-421815835),a=i(a,h,s,u,o[15],16,530742520),u=i(u,a,h,s,o[2],23,-995338651),s=f(s,u,a,h,o[0],6,-198630844),h=f(h,s,u,a,o[7],10,1126891415),a=f(a,h,s,u,o[14],15,-1416354905),u=f(u,a,h,s,o[5],21,-57434055),s=f(s,u,a,h,o[12],6,1700485571),h=f(h,s,u,a,o[3],10,-1894986606),a=f(a,h,s,u,o[10],15,-1051523),u=f(u,a,h,s,o[1],21,-2054922799),s=f(s,u,a,h,o[8],6,1873313359),h=f(h,s,u,a,o[15],10,-30611744),a=f(a,h,s,u,o[6],15,-1560198380),u=f(u,a,h,s,o[13],21,1309151649),s=f(s,u,a,h,o[4],6,-145523070),h=f(h,s,u,a,o[11],10,-1120210379),a=f(a,h,s,u,o[2],15,718787259),u=f(u,a,h,s,o[9],21,-343485551),r[0]=t(s,r[0]),r[1]=t(u,r[1]),r[2]=t(a,r[2]),r[3]=t(h,r[3])},s=function(t){var r,e=[];for(r=0;64>r;r+=4)e[r>>2]=t.charCodeAt(r)+(t.charCodeAt(r+1)<<8)+(t.charCodeAt(r+2)<<16)+(t.charCodeAt(r+3)<<24);return e},u=function(t){var r,e=[];for(r=0;64>r;r+=4)e[r>>2]=t[r]+(t[r+1]<<8)+(t[r+2]<<16)+(t[r+3]<<24);return e},a=function(t){var r,e,n,i,f,u,a=t.length,h=[1732584193,-271733879,-1732584194,271733878];for(r=64;a>=r;r+=64)o(h,s(t.substring(r-64,r)));for(t=t.substring(r-64),e=t.length,n=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],r=0;e>r;r+=1)n[r>>2]|=t.charCodeAt(r)<<(r%4<<3);if(n[r>>2]|=128<<(r%4<<3),r>55)for(o(h,n),r=0;16>r;r+=1)n[r]=0;return i=8*a,i=i.toString(16).match(/(.*?)(.{0,8})$/),f=parseInt(i[2],16),u=parseInt(i[1],16)||0,n[14]=f,n[15]=u,o(h,n),h},h=function(t){var r,e,n,i,f,s,a=t.length,h=[1732584193,-271733879,-1732584194,271733878];for(r=64;a>=r;r+=64)o(h,u(t.subarray(r-64,r)));for(t=a>r-64?t.subarray(r-64):new Uint8Array(0),e=t.length,n=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],r=0;e>r;r+=1)n[r>>2]|=t[r]<<(r%4<<3);if(n[r>>2]|=128<<(r%4<<3),r>55)for(o(h,n),r=0;16>r;r+=1)n[r]=0;return i=8*a,i=i.toString(16).match(/(.*?)(.{0,8})$/),f=parseInt(i[2],16),s=parseInt(i[1],16)||0,n[14]=f,n[15]=s,o(h,n),h},c=["0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"],p=function(t){var r,e="";for(r=0;4>r;r+=1)e+=c[t>>8*r+4&15]+c[t>>8*r&15];return e},y=function(t){var r;for(r=0;r<t.length;r+=1)t[r]=p(t[r]);return t.join("")},_=function(t){return y(a(t))},d=function(){this.reset()};return"5d41402abc4b2a76b9719d911017c592"!==_("hello")&&(t=function(t,r){var e=(65535&t)+(65535&r),n=(t>>16)+(r>>16)+(e>>16);return n<<16|65535&e}),d.prototype.append=function(t){return/[\u0080-\uFFFF]/.test(t)&&(t=unescape(encodeURIComponent(t))),this.appendBinary(t),this},d.prototype.appendBinary=function(t){this._buff+=t,this._length+=t.length;var r,e=this._buff.length;for(r=64;e>=r;r+=64)o(this._state,s(this._buff.substring(r-64,r)));return this._buff=this._buff.substr(r-64),this},d.prototype.end=function(t){var r,e,n=this._buff,i=n.length,f=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(r=0;i>r;r+=1)f[r>>2]|=n.charCodeAt(r)<<(r%4<<3);return this._finish(f,i),e=t?this._state:y(this._state),this.reset(),e},d.prototype._finish=function(t,r){var e,n,i,f=r;if(t[f>>2]|=128<<(f%4<<3),f>55)for(o(this._state,t),f=0;16>f;f+=1)t[f]=0;e=8*this._length,e=e.toString(16).match(/(.*?)(.{0,8})$/),n=parseInt(e[2],16),i=parseInt(e[1],16)||0,t[14]=n,t[15]=i,o(this._state,t)},d.prototype.reset=function(){return this._buff="",this._length=0,this._state=[1732584193,-271733879,-1732584194,271733878],this},d.prototype.destroy=function(){delete this._state,delete this._buff,delete this._length},d.hash=function(t,r){/[\u0080-\uFFFF]/.test(t)&&(t=unescape(encodeURIComponent(t)));var e=a(t);return r?e:y(e)},d.hashBinary=function(t,r){var e=a(t);return r?e:y(e)},d.ArrayBuffer=function(){this.reset()},d.ArrayBuffer.prototype.append=function(t){var r,e=this._concatArrayBuffer(this._buff,t),n=e.length;for(this._length+=t.byteLength,r=64;n>=r;r+=64)o(this._state,u(e.subarray(r-64,r)));return this._buff=n>r-64?e.subarray(r-64):new Uint8Array(0),this},d.ArrayBuffer.prototype.end=function(t){var r,e,n=this._buff,i=n.length,f=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(r=0;i>r;r+=1)f[r>>2]|=n[r]<<(r%4<<3);return this._finish(f,i),e=t?this._state:y(this._state),this.reset(),e},d.ArrayBuffer.prototype._finish=d.prototype._finish,d.ArrayBuffer.prototype.reset=function(){return this._buff=new Uint8Array(0),this._length=0,this._state=[1732584193,-271733879,-1732584194,271733878],this},d.ArrayBuffer.prototype.destroy=d.prototype.destroy,d.ArrayBuffer.prototype._concatArrayBuffer=function(t,r){var e=t.length,n=new Uint8Array(e+r.byteLength);return n.set(t),n.set(new Uint8Array(r),e),n},d.ArrayBuffer.hash=function(t,r){var e=h(new Uint8Array(t));return r?e:y(e)},d});
},{}],9:[function(require,module,exports){
function Traverse(e){this.value=e}function walk(e,t,r){var o=[],n=[],a=!0;return function i(e){function c(){if("object"==typeof l.node&&null!==l.node){l.keys&&l.node_===l.node||(l.keys=objectKeys(l.node)),l.isLeaf=0==l.keys.length;for(var t=0;t<n.length;t++)if(n[t].node_===e){l.circular=n[t];break}}else l.isLeaf=!0,l.keys=null;l.notLeaf=!l.isLeaf,l.notRoot=!l.isRoot}var s=r?copy(e):e,u={},f=!0,l={node:s,node_:e,path:[].concat(o),parent:n[n.length-1],parents:n,key:o.slice(-1)[0],isRoot:0===o.length,level:o.length,circular:null,update:function(e,t){l.isRoot||(l.parent.node[l.key]=e),l.node=e,t&&(f=!1)},"delete":function(e){delete l.parent.node[l.key],e&&(f=!1)},remove:function(e){isArray(l.parent.node)?l.parent.node.splice(l.key,1):delete l.parent.node[l.key],e&&(f=!1)},keys:null,before:function(e){u.before=e},after:function(e){u.after=e},pre:function(e){u.pre=e},post:function(e){u.post=e},stop:function(){a=!1},block:function(){f=!1}};if(!a)return l;c();var p=t.call(l,l.node);return void 0!==p&&l.update&&l.update(p),u.before&&u.before.call(l,l.node),f?("object"!=typeof l.node||null===l.node||l.circular||(n.push(l),c(),forEach(l.keys,function(e,t){o.push(e),u.pre&&u.pre.call(l,l.node[e],e);var n=i(l.node[e]);r&&hasOwnProperty.call(l.node,e)&&(l.node[e]=n.node),n.isLast=t==l.keys.length-1,n.isFirst=0==t,u.post&&u.post.call(l,n),o.pop()}),n.pop()),u.after&&u.after.call(l,l.node),l):l}(e).node}function copy(e){if("object"==typeof e&&null!==e){var t;if(isArray(e))t=[];else if(isDate(e))t=new Date(e.getTime?e.getTime():e);else if(isRegExp(e))t=new RegExp(e);else if(isError(e))t={message:e.message};else if(isBoolean(e))t=new Boolean(e);else if(isNumber(e))t=new Number(e);else if(isString(e))t=new String(e);else if(Object.create&&Object.getPrototypeOf)t=Object.create(Object.getPrototypeOf(e));else if(e.constructor===Object)t={};else{var r=e.constructor&&e.constructor.prototype||e.__proto__||{},o=function(){};o.prototype=r,t=new o}return forEach(objectKeys(e),function(r){t[r]=e[r]}),t}return e}function toS(e){return Object.prototype.toString.call(e)}function isDate(e){return"[object Date]"===toS(e)}function isRegExp(e){return"[object RegExp]"===toS(e)}function isError(e){return"[object Error]"===toS(e)}function isBoolean(e){return"[object Boolean]"===toS(e)}function isNumber(e){return"[object Number]"===toS(e)}function isString(e){return"[object String]"===toS(e)}var traverse=module.exports=function(e){return new Traverse(e)};Traverse.prototype.get=function(e){for(var t=this.value,r=0;r<e.length;r++){var o=e[r];if(!t||!hasOwnProperty.call(t,o)){t=void 0;break}t=t[o]}return t},Traverse.prototype.has=function(e){for(var t=this.value,r=0;r<e.length;r++){var o=e[r];if(!t||!hasOwnProperty.call(t,o))return!1;t=t[o]}return!0},Traverse.prototype.set=function(e,t){for(var r=this.value,o=0;o<e.length-1;o++){var n=e[o];hasOwnProperty.call(r,n)||(r[n]={}),r=r[n]}return r[e[o]]=t,t},Traverse.prototype.map=function(e){return walk(this.value,e,!0)},Traverse.prototype.forEach=function(e){return this.value=walk(this.value,e,!1),this.value},Traverse.prototype.reduce=function(e,t){var r=1===arguments.length,o=r?this.value:t;return this.forEach(function(t){this.isRoot&&r||(o=e.call(this,o,t))}),o},Traverse.prototype.paths=function(){var e=[];return this.forEach(function(){e.push(this.path)}),e},Traverse.prototype.nodes=function(){var e=[];return this.forEach(function(){e.push(this.node)}),e},Traverse.prototype.clone=function(){var e=[],t=[];return function r(o){for(var n=0;n<e.length;n++)if(e[n]===o)return t[n];if("object"==typeof o&&null!==o){var a=copy(o);return e.push(o),t.push(a),forEach(objectKeys(o),function(e){a[e]=r(o[e])}),e.pop(),t.pop(),a}return o}(this.value)};var objectKeys=Object.keys||function(e){var t=[];for(var r in e)t.push(r);return t},isArray=Array.isArray||function(e){return"[object Array]"===Object.prototype.toString.call(e)},forEach=function(e,t){if(e.forEach)return e.forEach(t);for(var r=0;r<e.length;r++)t(e[r],r,e)};forEach(objectKeys(Traverse.prototype),function(e){traverse[e]=function(t){var r=[].slice.call(arguments,1),o=new Traverse(t);return o[e].apply(o,r)}});var hasOwnProperty=Object.hasOwnProperty||function(e,t){return t in e};
},{}],10:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/apiDeclaration.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "swaggerVersion", "basePath", "apis" ],
    "properties": {
        "swaggerVersion": { "enum": [ "1.2" ] },
        "apiVersion": { "type": "string" },
        "basePath": {
            "type": "string",
            "format": "uri",
            "pattern": "^https?://"
        },
        "resourcePath": {
            "type": "string",
            "format": "uri",
            "pattern": "^/"
        },
        "apis": {
            "type": "array",
            "items": { "$ref": "#/definitions/apiObject" }
        },
        "models": {
            "type": "object",
            "additionalProperties": {
                "$ref": "modelsObject.json#"
            }
        },
        "produces": { "$ref": "#/definitions/mimeTypeArray" },
        "consumes": { "$ref": "#/definitions/mimeTypeArray" },
        "authorizations": { "$ref": "authorizationObject.json#" }
    },
    "additionalProperties": false,
    "definitions": {
        "apiObject": {
            "type": "object",
            "required": [ "path", "operations" ],
            "properties": {
                "path": {
                    "type": "string",
                    "format": "uri-template",
                    "pattern": "^/"
                },
                "description": { "type": "string" },
                "operations": {
                    "type": "array",
                    "items": { "$ref": "operationObject.json#" }
                }
            },
            "additionalProperties": false
        },
        "mimeTypeArray": {
            "type": "array",
            "items": {
                "type": "string",
                "format": "mime-type"
            }
        }
    }
}

},{}],11:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/authorizationObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "additionalProperties": {
        "oneOf": [
            {
                "$ref": "#/definitions/basicAuth"
            },
            {
                "$ref": "#/definitions/apiKey"
            },
            {
                "$ref": "#/definitions/oauth2"
            }
        ]
    },
    "definitions": {
        "basicAuth": {
            "required": [ "type" ],
            "properties": {
                "type": { "enum": [ "basicAuth" ] }
            },
            "additionalProperties": false
        },
        "apiKey": {
            "required": [ "type", "passAs", "keyname" ],
            "properties": {
                "type": { "enum": [ "apiKey" ] },
                "passAs": { "enum": [ "header", "query" ] },
                "keyname": { "type": "string" }
            },
            "additionalProperties": false
        },
        "oauth2": {
            "type": "object",
            "required": [ "type", "grantTypes" ],
            "properties": {
                "type": { "enum": [ "oauth2" ] },
                "scopes": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/oauth2Scope" }
                },
                "grantTypes": { "$ref": "oauth2GrantType.json#" }
            },
            "additionalProperties": false
        },
        "oauth2Scope": {
            "type": "object",
            "required": [ "scope" ],
            "properties": {
                "scope": { "type": "string" },
                "description": { "type": "string" }
            },
            "additionalProperties": false
        }
    }
}


},{}],12:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/dataType.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Data type as described by the specification (version 1.2)",
    "type": "object",
    "oneOf": [
        { "$ref": "#/definitions/refType" },
        { "$ref": "#/definitions/voidType" },
        { "$ref": "#/definitions/primitiveType" },
        { "$ref": "#/definitions/modelType" },
        { "$ref": "#/definitions/arrayType" }
    ],
    "definitions": {
        "refType": {
            "required": [ "$ref" ],
            "properties": {
                "$ref": { "type": "string" }
            },
            "additionalProperties": false
        },
        "voidType": {
            "enum": [ { "type": "void" } ]
        },
        "modelType": {
            "required": [ "type" ],
            "properties": {
                "type": {
                    "type": "string",
                    "not": {
                        "enum": [ "boolean", "integer", "number", "string", "array" ]
                    }
                }
            },
            "additionalProperties": false
        },
        "primitiveType": {
            "required": [ "type" ],
            "properties": {
                "type": {
                    "enum": [ "boolean", "integer", "number", "string" ]
                },
                "format": { "type": "string" },
                "defaultValue": {
                    "not": { "type": [ "array", "object", "null" ] }
                },
                "enum": {
                    "type": "array",
                    "items": { "type": "string" },
                    "minItems": 1,
                    "uniqueItems": true
                },
                "minimum": { "type": "string" },
                "maximum": { "type": "string" }
            },
            "additionalProperties": false,
            "dependencies": {
                "format": {
                    "oneOf": [
                        {
                            "properties": {
                                "type": { "enum": [ "integer" ] },
                                "format": { "enum": [ "int32", "int64" ] }
                            }
                        },
                        {
                            "properties": {
                                "type": { "enum": [ "number" ] },
                                "format": { "enum": [ "float", "double" ] }
                            }
                        },
                        {
                            "properties": {
                                "type": { "enum": [ "string" ] },
                                "format": {
                                    "enum": [ "byte", "date", "date-time" ]
                                }
                            }
                        }
                    ]
                },
                "enum": {
                    "properties": {
                        "type": { "enum": [ "string" ] }
                    }
                },
                "minimum": {
                    "properties": {
                        "type": { "enum": [ "integer", "number" ] }
                    }
                },
                "maximum": {
                    "properties": {
                        "type": { "enum": [ "integer", "number" ] }
                    }
                }
            }
        },
        "arrayType": {
            "required": [ "type", "items" ],
            "properties": {
                "type": { "enum": [ "array" ] },
                "items": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/itemsObject" }
                },
                "uniqueItems": { "type": "boolean" }
            },
            "additionalProperties": false
        },
        "itemsObject": {
            "oneOf": [
                {
                    "$ref": "#/definitions/refType"
                },
                {
                    "allOf": [
                        {
                            "$ref": "#/definitions/primitiveType"
                        },
                        {
                            "properties": {
                                "type": {},
                                "format": {}
                            },
                            "additionalProperties": false
                        }
                    ]
                }
            ]
        }
    }
}
},{}],13:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/dataTypeBase.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Data type fields (section 4.3.3)",
    "type": "object",
    "oneOf": [
        { "required": [ "type" ] },
        { "required": [ "$ref" ] }
    ],
    "properties": {
        "type": { "type": "string" },
        "$ref": { "type": "string" },
        "format": { "type": "string" },
        "defaultValue": {
            "not": { "type": [ "array", "object", "null" ] }
        },
        "enum": {
            "type": "array",
            "items": { "type": "string" },
            "uniqueItems": true,
            "minItems": 1
        },
        "minimum": { "type": "string" },
        "maximum": { "type": "string" },
        "items": { "$ref": "#/definitions/itemsObject" },
        "uniqueItems": { "type": "boolean" }
    },
    "dependencies": {
        "format": {
            "oneOf": [
                {
                    "properties": {
                        "type": { "enum": [ "integer" ] },
                        "format": { "enum": [ "int32", "int64" ] }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "number" ] },
                        "format": { "enum": [ "float", "double" ] }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "string" ] },
                        "format": {
                            "enum": [ "byte", "date", "date-time" ]
                        }
                    }
                }
            ]
        }
    },
    "definitions": {
        "itemsObject": {
            "oneOf": [
                {
                    "type": "object",
                    "required": [ "$ref" ],
                    "properties": {
                        "$ref": { "type": "string" }
                    },
                    "additionalProperties": false
                },
                {
                    "allOf": [
                        { "$ref": "#" },
                        {
                            "required": [ "type" ],
                            "properties": {
                                "type": {},
                                "format": {}
                            },
                            "additionalProperties": false
                        }
                    ]
                }
            ]
        }
    }
}

},{}],14:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/infoObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "info object (section 5.1.3)",
    "type": "object",
    "required": [ "title", "description" ],
    "properties": {
        "title": { "type": "string" },
        "description": { "type": "string" },
        "termsOfServiceUrl": { "type": "string", "format": "uri" },
        "contact": { "type": "string", "format": "email" },
        "license": { "type": "string" },
        "licenseUrl": { "type": "string", "format": "uri" }
    },
    "additionalProperties": false
}
},{}],15:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/modelsObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "id", "properties" ],
    "properties": {
        "id": { "type": "string" },
        "description": { "type": "string" },
        "properties": {
            "type": "object",
            "additionalProperties": { "$ref": "#/definitions/propertyObject" }
        },
        "subTypes": {
            "type": "array",
            "items": { "type": "string" },
            "uniqueItems": true
        },
        "discriminator": { "type": "string" }
    },
    "dependencies": {
        "subTypes": [ "discriminator" ]
    },
    "definitions": {
        "propertyObject": {
            "allOf": [
                {
                    "not": { "$ref": "#" }
                },
                {
                    "$ref": "dataTypeBase.json#"
                }
            ]
        }
    }
}


},{}],16:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/oauth2GrantType.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "minProperties": 1,
    "properties": {
        "implicit": { "$ref": "#/definitions/implicit" },
        "authorization_code": { "$ref": "#/definitions/authorizationCode" }
    },
    "definitions": {
        "implicit": {
            "type": "object",
            "required": [ "loginEndpoint" ],
            "properties": {
                "loginEndpoint": { "$ref": "#/definitions/loginEndpoint" },
                "tokenName": { "type": "string" }
            },
            "additionalProperties": false
        },
        "authorizationCode": {
            "type": "object",
            "required": [ "tokenEndpoint", "tokenRequestEndpoint" ],
            "properties": {
                "tokenEndpoint": { "$ref": "#/definitions/tokenEndpoint" },
                "tokenRequestEndpoint": { "$ref": "#/definitions/tokenRequestEndpoint" }
            },
            "additionalProperties": false
        },
        "loginEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" }
            },
            "additionalProperties": false
        },
        "tokenEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" },
                "tokenName": { "type": "string" }
            },
            "additionalProperties": false
        },
        "tokenRequestEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" },
                "clientIdName": { "type": "string" },
                "clientSecretName": { "type": "string" }
            },
            "additionalProperties": false
        }
    }
}
},{}],17:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/operationObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "allOf": [
        { "$ref": "dataTypeBase.json#" },
        {
            "required": [ "method", "nickname", "parameters" ],
            "properties": {
                "method": { "enum": [ "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS" ] },
                "summary": { "type": "string", "maxLength": 120 },
                "notes": { "type": "string" },
                "nickname": {
                    "type": "string",
                    "pattern": "^[a-zA-Z0-9_]+$"
                },
                "authorizations": {
                    "type": "object",
                    "additionalProperties": {
                        "type": "array",
                        "items": {
                            "$ref": "authorizationObject.json#/definitions/oauth2Scope"
                        }
                    }
                },
                "parameters": {
                    "type": "array",
                    "items": { "$ref": "parameterObject.json#" }
                },
                "responseMessages": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/responseMessageObject"}
                },
                "produces": { "$ref": "#/definitions/mimeTypeArray" },
                "consumes": { "$ref": "#/definitions/mimeTypeArray" },
                "deprecated": { "enum": [ "true", "false" ] }
            }
        }
    ],
    "definitions": {
        "responseMessageObject": {
            "type": "object",
            "required": [ "code", "message" ],
            "properties": {
                "code": { "$ref": "#/definitions/rfc2616section10" },
                "message": { "type": "string" },
                "responseModel": { "type": "string" }
            }
        },
        "rfc2616section10": {
            "type": "integer",
            "minimum": 100,
            "maximum": 600,
            "exclusiveMaximum": true
        },
        "mimeTypeArray": {
            "type": "array",
            "items": {
                "type": "string",
                "format": "mime-type"
            }
        }
    }
}

},{}],18:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/parameterObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "allOf": [
        { "$ref": "dataTypeBase.json#" },
        {
            "required": [ "paramType", "name" ],
            "properties": {
                "paramType": {
                    "enum": [ "path", "query", "body", "header", "form" ]
                },
                "name": { "type": "string" },
                "description": { "type": "string" },
                "required": { "type": "boolean" },
                "allowMultiple": { "type": "boolean" }
            }
        },
        {
            "description": "type File requires special paramType and consumes",
            "oneOf": [
                {
                    "properties": {
                        "type": { "not": { "enum": [ "File" ] } }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "File" ] },
                        "paramType": { "enum": [ "form" ] },
                        "consumes": { "enum": [ "multipart/form-data" ] }
                    }
                }
            ]
        }
    ]
}

},{}],19:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/resourceListing.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "swaggerVersion", "apis" ],
    "properties": {
        "swaggerVersion": { "enum": [ "1.2" ] },
        "apis": {
            "type": "array",
            "items": { "$ref": "resourceObject.json#" }
        },
        "apiVersion": { "type": "string" },
        "info": { "$ref": "infoObject.json#" },
        "authorizations": { "$ref": "authorizationObject.json#" }
    }
}

},{}],20:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/resourceObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "path" ],
    "properties": {
        "path": { "type": "string", "format": "uri" },
        "description": { "type": "string" }
    },
    "additionalProperties": false
}
},{}],21:[function(require,module,exports){
module.exports={
  "title": "A JSON Schema for Swagger 2.0 API.",
  "id": "http://swagger.io/v2/schema.json#",
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "required": [
    "swagger",
    "info",
    "paths"
  ],
  "additionalProperties": false,
  "patternProperties": {
    "^x-": {
      "$ref": "#/definitions/vendorExtension"
    }
  },
  "properties": {
    "swagger": {
      "type": "string",
      "enum": [
        "2.0"
      ],
      "description": "The Swagger version of this document."
    },
    "info": {
      "$ref": "#/definitions/info"
    },
    "host": {
      "type": "string",
      "format": "uri",
      "pattern": "^[^{}/ :\\\\]+(?::\\d+)?$",
      "description": "The fully qualified URI to the host of the API."
    },
    "basePath": {
      "type": "string",
      "pattern": "^/",
      "description": "The base path to the API. Example: '/api'."
    },
    "schemes": {
      "$ref": "#/definitions/schemesList"
    },
    "consumes": {
      "description": "A list of MIME types accepted by the API.",
      "$ref": "#/definitions/mediaTypeList"
    },
    "produces": {
      "description": "A list of MIME types the API can produce.",
      "$ref": "#/definitions/mediaTypeList"
    },
    "paths": {
      "$ref": "#/definitions/paths"
    },
    "definitions": {
      "$ref": "#/definitions/definitions"
    },
    "parameters": {
      "$ref": "#/definitions/parameterDefinitions"
    },
    "responses": {
      "$ref": "#/definitions/responseDefinitions"
    },
    "security": {
      "$ref": "#/definitions/security"
    },
    "securityDefinitions": {
      "$ref": "#/definitions/securityDefinitions"
    },
    "tags": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/tag"
      },
      "uniqueItems": true
    },
    "externalDocs": {
      "$ref": "#/definitions/externalDocs"
    }
  },
  "definitions": {
    "info": {
      "type": "object",
      "description": "General information about the API.",
      "required": [
        "version",
        "title"
      ],
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "title": {
          "type": "string",
          "description": "A unique and precise title of the API."
        },
        "version": {
          "type": "string",
          "description": "A semantic version number of the API."
        },
        "description": {
          "type": "string",
          "description": "A longer description of the API. Should be different from the title.  Github-flavored markdown is allowed."
        },
        "termsOfService": {
          "type": "string",
          "description": "The terms of service for the API."
        },
        "contact": {
          "$ref": "#/definitions/contact"
        },
        "license": {
          "$ref": "#/definitions/license"
        }
      }
    },
    "contact": {
      "type": "object",
      "description": "Contact information for the owners of the API.",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "The identifying name of the contact person/organization."
        },
        "url": {
          "type": "string",
          "description": "The URL pointing to the contact information.",
          "format": "uri"
        },
        "email": {
          "type": "string",
          "description": "The email address of the contact person/organization.",
          "format": "email"
        }
      }
    },
    "license": {
      "type": "object",
      "required": [
        "name"
      ],
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "The name of the license type. It's encouraged to use an OSI compatible license."
        },
        "url": {
          "type": "string",
          "description": "The URL pointing to the license.",
          "format": "uri"
        }
      }
    },
    "paths": {
      "type": "object",
      "description": "Relative paths to the individual endpoints. They must be relative to the 'basePath'.",
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        },
        "^/": {
          "$ref": "#/definitions/pathItem"
        }
      },
      "additionalProperties": false
    },
    "definitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/schema"
      },
      "description": "One or more JSON objects describing the schemas being consumed and produced by the API."
    },
    "parameterDefinitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/parameter"
      },
      "description": "One or more JSON representations for parameters"
    },
    "responseDefinitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/response"
      },
      "description": "One or more JSON representations for parameters"
    },
    "externalDocs": {
      "type": "object",
      "additionalProperties": false,
      "description": "information about external documentation",
      "required": [
        "url"
      ],
      "properties": {
        "description": {
          "type": "string"
        },
        "url": {
          "type": "string",
          "format": "uri"
        }
      }
    },
    "examples": {
      "type": "object",
      "patternProperties": {
        "^[a-z0-9-]+/[a-z0-9\\-+]+$": {}
      },
      "additionalProperties": false
    },
    "mimeType": {
      "type": "string",
      "pattern": "^[\\sa-z0-9\\-+;\\.=\\/]+$",
      "description": "The MIME type of the HTTP message."
    },
    "operation": {
      "type": "object",
      "required": [
        "responses"
      ],
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "summary": {
          "type": "string",
          "description": "A brief summary of the operation."
        },
        "description": {
          "type": "string",
          "description": "A longer description of the operation, github-flavored markdown is allowed."
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        },
        "operationId": {
          "type": "string",
          "description": "A friendly name of the operation"
        },
        "produces": {
          "description": "A list of MIME types the API can produce.",
          "$ref": "#/definitions/mediaTypeList"
        },
        "consumes": {
          "description": "A list of MIME types the API can consume.",
          "$ref": "#/definitions/mediaTypeList"
        },
        "parameters": {
          "$ref": "#/definitions/parametersList"
        },
        "responses": {
          "$ref": "#/definitions/responses"
        },
        "schemes": {
          "$ref": "#/definitions/schemesList"
        },
        "deprecated": {
          "type": "boolean",
          "default": false
        },
        "security": {
          "$ref": "#/definitions/security"
        }
      }
    },
    "pathItem": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "$ref": {
          "type": "string"
        },
        "get": {
          "$ref": "#/definitions/operation"
        },
        "put": {
          "$ref": "#/definitions/operation"
        },
        "post": {
          "$ref": "#/definitions/operation"
        },
        "delete": {
          "$ref": "#/definitions/operation"
        },
        "options": {
          "$ref": "#/definitions/operation"
        },
        "head": {
          "$ref": "#/definitions/operation"
        },
        "patch": {
          "$ref": "#/definitions/operation"
        },
        "parameters": {
          "$ref": "#/definitions/parametersList"
        }
      }
    },
    "responses": {
      "type": "object",
      "description": "Response objects names can either be any valid HTTP status code or 'default'.",
      "minProperties": 1,
      "additionalProperties": false,
      "patternProperties": {
        "^([0-9]{3})$|^(default)$": {
          "$ref": "#/definitions/responseValue"
        },
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "not": {
        "type": "object",
        "additionalProperties": false,
        "patternProperties": {
          "^x-": {
            "$ref": "#/definitions/vendorExtension"
          }
        }
      }
    },
    "responseValue": {
      "oneOf": [
        {
          "$ref": "#/definitions/response"
        },
        {
          "$ref": "#/definitions/jsonReference"
        }
      ]
    },
    "response": {
      "type": "object",
      "required": [
        "description"
      ],
      "properties": {
        "description": {
          "type": "string"
        },
        "schema": {
          "$ref": "#/definitions/schema"
        },
        "headers": {
          "$ref": "#/definitions/headers"
        },
        "examples": {
          "$ref": "#/definitions/examples"
        }
      },
      "additionalProperties": false
    },
    "headers": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/header"
      }
    },
    "header": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "integer",
            "boolean",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        },
        "description": {
          "type": "string"
        }
      }
    },
    "vendorExtension": {
      "description": "Any property starting with x- is valid.",
      "additionalProperties": true,
      "additionalItems": true
    },
    "bodyParameter": {
      "type": "object",
      "required": [
        "name",
        "in",
        "schema"
      ],
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "body"
          ]
        },
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "schema": {
          "$ref": "#/definitions/schema"
        }
      },
      "additionalProperties": false
    },
    "headerParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "header"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "queryParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "query"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormatWithMulti"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "formDataParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "formData"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array",
            "file"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormatWithMulti"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "pathParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "enum": [
            true
          ],
          "description": "Determines whether or not this parameter is required or optional."
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "path"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "nonBodyParameter": {
      "type": "object",
      "required": [
        "name",
        "in",
        "type"
      ],
      "oneOf": [
        {
          "$ref": "#/definitions/headerParameterSubSchema"
        },
        {
          "$ref": "#/definitions/formDataParameterSubSchema"
        },
        {
          "$ref": "#/definitions/queryParameterSubSchema"
        },
        {
          "$ref": "#/definitions/pathParameterSubSchema"
        }
      ]
    },
    "parameter": {
      "oneOf": [
        {
          "$ref": "#/definitions/bodyParameter"
        },
        {
          "$ref": "#/definitions/nonBodyParameter"
        }
      ]
    },
    "schema": {
      "type": "object",
      "description": "A deterministic version of a JSON Schema object.",
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "$ref": {
          "type": "string"
        },
        "format": {
          "type": "string"
        },
        "title": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/title"
        },
        "description": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/description"
        },
        "default": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/default"
        },
        "multipleOf": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/multipleOf"
        },
        "maximum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minLength": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "pattern": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/pattern"
        },
        "maxItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "uniqueItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/uniqueItems"
        },
        "maxProperties": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minProperties": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "required": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/stringArray"
        },
        "enum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/enum"
        },
        "type": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/type"
        },
        "items": {
          "anyOf": [
            {
              "$ref": "#/definitions/schema"
            },
            {
              "type": "array",
              "minItems": 1,
              "items": {
                "$ref": "#/definitions/schema"
              }
            }
          ],
          "default": {}
        },
        "allOf": {
          "type": "array",
          "minItems": 1,
          "items": {
            "$ref": "#/definitions/schema"
          }
        },
        "properties": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/schema"
          },
          "default": {}
        },
        "discriminator": {
          "type": "string"
        },
        "readOnly": {
          "type": "boolean",
          "default": false
        },
        "xml": {
          "$ref": "#/definitions/xml"
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        },
        "example": {}
      }
    },
    "primitivesItems": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "integer",
            "boolean",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "security": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/securityRequirement"
      },
      "uniqueItems": true
    },
    "securityRequirement": {
      "type": "object",
      "additionalProperties": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "uniqueItems": true
      }
    },
    "xml": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string"
        },
        "namespace": {
          "type": "string"
        },
        "prefix": {
          "type": "string"
        },
        "attribute": {
          "type": "boolean",
          "default": false
        },
        "wrapped": {
          "type": "boolean",
          "default": false
        }
      }
    },
    "tag": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "securityDefinitions": {
      "type": "object",
      "additionalProperties": {
        "oneOf": [
          {
            "$ref": "#/definitions/basicAuthenticationSecurity"
          },
          {
            "$ref": "#/definitions/apiKeySecurity"
          },
          {
            "$ref": "#/definitions/oauth2ImplicitSecurity"
          },
          {
            "$ref": "#/definitions/oauth2PasswordSecurity"
          },
          {
            "$ref": "#/definitions/oauth2ApplicationSecurity"
          },
          {
            "$ref": "#/definitions/oauth2AccessCodeSecurity"
          }
        ]
      }
    },
    "basicAuthenticationSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "basic"
          ]
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "apiKeySecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "name",
        "in"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "apiKey"
          ]
        },
        "name": {
          "type": "string"
        },
        "in": {
          "type": "string",
          "enum": [
            "header",
            "query"
          ]
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2ImplicitSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "authorizationUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "implicit"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "authorizationUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2PasswordSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "password"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2ApplicationSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "application"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2AccessCodeSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "authorizationUrl",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "accessCode"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "authorizationUrl": {
          "type": "string",
          "format": "uri"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2Scopes": {
      "type": "object",
      "additionalProperties": {
        "type": "string"
      }
    },
    "mediaTypeList": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/mimeType"
      },
      "uniqueItems": true
    },
    "parametersList": {
      "type": "array",
      "description": "The parameters needed to send a valid API call.",
      "minItems": 1,
      "additionalItems": false,
      "items": {
        "oneOf": [
          {
            "$ref": "#/definitions/parameter"
          },
          {
            "$ref": "#/definitions/jsonReference"
          }
        ]
      },
      "uniqueItems": true
    },
    "schemesList": {
      "type": "array",
      "description": "The transfer protocol of the API.",
      "items": {
        "type": "string",
        "enum": [
          "http",
          "https",
          "ws",
          "wss"
        ]
      },
      "uniqueItems": true
    },
    "collectionFormat": {
      "type": "string",
      "enum": [
        "csv",
        "ssv",
        "tsv",
        "pipes"
      ],
      "default": "csv"
    },
    "collectionFormatWithMulti": {
      "type": "string",
      "enum": [
        "csv",
        "ssv",
        "tsv",
        "pipes",
        "multi"
      ],
      "default": "csv"
    },
    "title": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/title"
    },
    "description": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/description"
    },
    "default": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/default"
    },
    "multipleOf": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/multipleOf"
    },
    "maximum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/maximum"
    },
    "exclusiveMaximum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMaximum"
    },
    "minimum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/minimum"
    },
    "exclusiveMinimum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMinimum"
    },
    "maxLength": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
    },
    "minLength": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
    },
    "pattern": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/pattern"
    },
    "maxItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
    },
    "minItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
    },
    "uniqueItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/uniqueItems"
    },
    "enum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/enum"
    },
    "jsonReference": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "$ref": {
          "type": "string"
        }
      }
    }
  }
}

},{}],22:[function(require,module,exports){
module.exports={
    "id": "http://json-schema.org/draft-04/schema#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Core schema meta-schema",
    "definitions": {
        "schemaArray": {
            "type": "array",
            "minItems": 1,
            "items": { "$ref": "#" }
        },
        "positiveInteger": {
            "type": "integer",
            "minimum": 0
        },
        "positiveIntegerDefault0": {
            "allOf": [ { "$ref": "#/definitions/positiveInteger" }, { "default": 0 } ]
        },
        "simpleTypes": {
            "enum": [ "array", "boolean", "integer", "null", "number", "object", "string" ]
        },
        "stringArray": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1,
            "uniqueItems": true
        }
    },
    "type": "object",
    "properties": {
        "id": {
            "type": "string",
            "format": "uri"
        },
        "$schema": {
            "type": "string",
            "format": "uri"
        },
        "title": {
            "type": "string"
        },
        "description": {
            "type": "string"
        },
        "default": {},
        "multipleOf": {
            "type": "number",
            "minimum": 0,
            "exclusiveMinimum": true
        },
        "maximum": {
            "type": "number"
        },
        "exclusiveMaximum": {
            "type": "boolean",
            "default": false
        },
        "minimum": {
            "type": "number"
        },
        "exclusiveMinimum": {
            "type": "boolean",
            "default": false
        },
        "maxLength": { "$ref": "#/definitions/positiveInteger" },
        "minLength": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "pattern": {
            "type": "string",
            "format": "regex"
        },
        "additionalItems": {
            "anyOf": [
                { "type": "boolean" },
                { "$ref": "#" }
            ],
            "default": {}
        },
        "items": {
            "anyOf": [
                { "$ref": "#" },
                { "$ref": "#/definitions/schemaArray" }
            ],
            "default": {}
        },
        "maxItems": { "$ref": "#/definitions/positiveInteger" },
        "minItems": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "uniqueItems": {
            "type": "boolean",
            "default": false
        },
        "maxProperties": { "$ref": "#/definitions/positiveInteger" },
        "minProperties": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "required": { "$ref": "#/definitions/stringArray" },
        "additionalProperties": {
            "anyOf": [
                { "type": "boolean" },
                { "$ref": "#" }
            ],
            "default": {}
        },
        "definitions": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "properties": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "patternProperties": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "dependencies": {
            "type": "object",
            "additionalProperties": {
                "anyOf": [
                    { "$ref": "#" },
                    { "$ref": "#/definitions/stringArray" }
                ]
            }
        },
        "enum": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true
        },
        "type": {
            "anyOf": [
                { "$ref": "#/definitions/simpleTypes" },
                {
                    "type": "array",
                    "items": { "$ref": "#/definitions/simpleTypes" },
                    "minItems": 1,
                    "uniqueItems": true
                }
            ]
        },
        "allOf": { "$ref": "#/definitions/schemaArray" },
        "anyOf": { "$ref": "#/definitions/schemaArray" },
        "oneOf": { "$ref": "#/definitions/schemaArray" },
        "not": { "$ref": "#" }
    },
    "dependencies": {
        "exclusiveMaximum": [ "maximum" ],
        "exclusiveMinimum": [ "minimum" ]
    },
    "default": {}
}

},{}]},{},[1])(1)
});