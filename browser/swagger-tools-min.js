!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self),(o.SwaggerTools||(o.SwaggerTools={})).specs=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";var _={cloneDeep:require("lodash.clonedeep"),difference:require("lodash.difference"),each:require("lodash.foreach"),isArray:require("lodash.isarray"),isPlainObject:require("lodash.isplainobject"),isUndefined:require("lodash.isundefined"),map:require("lodash.map"),reduce:require("lodash.reduce"),union:require("lodash.union"),uniq:require("lodash.uniq")},jjv=require("jjv"),jjve=require("jjve"),md5=require("spark-md5"),traverse=require("traverse"),helpers=require("./helpers"),validators=require("./validators"),draft04Json=require("../schemas/json-schema-draft-04.json"),draft04Url="http://json-schema.org/draft-04/schema",jjvOptions={checkRequired:!0,removeAdditional:!1,useDefault:!1,useCoerce:!1},jjveOptions={formatPath:!1},metadataCache={},refToJsonPointer=helpers.refToJsonPointer,toJsonPointer=helpers.toJsonPointer,createValidator=function(e,r){var a=jjv(jjvOptions);return a.addFormat("uri",function(){return!0}),a.addSchema(draft04Url,draft04Json),_.each(r,function(r){var t=_.cloneDeep(e.schemas[r]);t.id=r,a.addSchema(r,t)}.bind(this)),a.je=jjve(a),a},createErrorOrWarning=function(e,r,a,t,n){n.push({code:e,message:r,data:a,path:t})},createUnusedErrorOrWarning=function(e,r,a,t,n,i){createErrorOrWarning("UNUSED_"+a,t+" is defined but is not used: "+r,e,n,i)},validateExist=function(e,r,a,t,n,i){_.isUndefined(e)||-1!==e.indexOf(r)||createErrorOrWarning("UNRESOLVABLE_"+a,t+" could not be resolved: "+r,r,n,i)},validateNoExist=function(e,r,a,t,n,i){!_.isUndefined(e)&&e.indexOf(r)>-1&&createErrorOrWarning("DUPLICATE_"+a,t+" already defined: "+r,r,n,i)},validateNoDuplicates=function(e,r,a,t,n){var i=t[t.length-1];_.isUndefined(e)||e.length===_.uniq(e).length||createErrorOrWarning("DUPLICATE_"+r,a+" "+i+" has duplicate items",e,t,n)},validateParameterConstraints=function(e,r,a,t,n){switch(e.version){case"1.2":try{validators.validateTypeAndFormat(r.name,a,"array"===r.type?r.items.type:r.type,"array"===r.type&&r.items.format?r.items.format:r.format)}catch(i){return void createErrorOrWarning("INVALID_TYPE",i.message,a,t,n)}try{validators.validateEnum(r.name,a,r.enum)}catch(i){return void createErrorOrWarning("ENUM_MISMATCH",i.message,a,t,n)}try{validators.validateMaximum(r.name,a,r.maximum,r.type)}catch(i){return void createErrorOrWarning("MAXIMUM",i.message,a,t,n)}try{validators.validateMinimum(r.name,a,r.minimum,r.type)}catch(i){return void createErrorOrWarning("MINIMUM",i.message,a,t,n)}try{validators.validateUniqueItems(r.name,a,r.uniqueItems)}catch(i){return void createErrorOrWarning("ARRAY_UNIQUE",i.message,a,t,n)}break;case"2.0":try{validators.validateTypeAndFormat(r.name,a,"array"===r.type?r.items.type:r.type,"array"===r.type&&r.items.format?r.items.format:r.format)}catch(i){return void createErrorOrWarning("INVALID_TYPE",i.message,a,t,n)}try{validators.validateEnum(r.name,a,r.enum)}catch(i){return void createErrorOrWarning("ENUM_MISMATCH",i.message,a,t,n)}try{validators.validateMaximum(r.name,a,r.maximum,r.type,r.exclusiveMaximum)}catch(i){return void createErrorOrWarning(r.exclusiveMaximum===!0?"MAXIMUM_EXCLUSIVE":"MAXIMUM",i.message,a,t,n)}try{validators.validateMaxItems(r.name,a,r.maxItems)}catch(i){return void createErrorOrWarning("ARRAY_LENGTH_LONG",i.message,a,t,n)}try{validators.validateMaxLength(r.name,a,r.maxLength)}catch(i){return void createErrorOrWarning("MAX_LENGTH",i.message,a,t,n)}try{validators.validateMinimum(r.name,a,r.minimum,r.type,r.exclusiveMinimum)}catch(i){return void createErrorOrWarning("true"===r.exclusiveMinimum?"MINIMUM_EXCLUSIVE":"MINIMUM",i.message,a,t,n)}try{validators.validateMinItems(r.name,a,r.minItems)}catch(i){return void createErrorOrWarning("ARRAY_LENGTH_SHORT",i.message,a,t,n)}try{validators.validateMinLength(r.name,a,r.minLength)}catch(i){return void createErrorOrWarning("MIN_LENGTH",i.message,a,t,n)}try{validators.validatePattern(r.name,a,r.pattern)}catch(i){return void createErrorOrWarning("PATTERN",i.message,a,t,n)}try{validators.validateUniqueItems(r.name,a,r.uniqueItems)}catch(i){return void createErrorOrWarning("ARRAY_UNIQUE",i.message,a,t,n)}}},normalizePath=function(e){var r=[],a=[];return _.each(e.split("/"),function(e){"{"===e.charAt(0)&&(r.push(e.substring(1).split("}")[0]),e="{"+(r.length-1)+"}"),a.push(e)}),{path:a.join("/"),args:r}},Specification=function(e){var r,a,t=["string","number","boolean","integer","array"];switch(e){case"1.2":r="https://github.com/wordnik/swagger-spec/blob/master/versions/1.2.md",t=_.union(t,["void","File"]),a="https://github.com/wordnik/swagger-spec/tree/master/schemas/v1.2";break;case"2.0":r="https://github.com/wordnik/swagger-spec/blob/master/versions/2.0.md",t=_.union(t,["file"]),a="https://github.com/wordnik/swagger-spec/tree/master/schemas/v2.0";break;default:throw new Error(e+" is an unsupported Swagger specification version")}switch(this.docsUrl=r,this.primitives=t,this.schemasUrl=a,this.version=e,this.schemas={},this.validators={},e){case"1.2":this.schemas["apiDeclaration.json"]=require("../schemas/1.2/apiDeclaration.json"),this.schemas["authorizationObject.json"]=require("../schemas/1.2/authorizationObject.json"),this.schemas["dataType.json"]=require("../schemas/1.2/dataType.json"),this.schemas["dataTypeBase.json"]=require("../schemas/1.2/dataTypeBase.json"),this.schemas["infoObject.json"]=require("../schemas/1.2/infoObject.json"),this.schemas["modelsObject.json"]=require("../schemas/1.2/modelsObject.json"),this.schemas["oauth2GrantType.json"]=require("../schemas/1.2/oauth2GrantType.json"),this.schemas["operationObject.json"]=require("../schemas/1.2/operationObject.json"),this.schemas["parameterObject.json"]=require("../schemas/1.2/parameterObject.json"),this.schemas["resourceListing.json"]=require("../schemas/1.2/resourceListing.json"),this.schemas["resourceObject.json"]=require("../schemas/1.2/resourceObject.json"),this.validators["apiDeclaration.json"]=createValidator(this,["dataTypeBase.json","modelsObject.json","oauth2GrantType.json","authorizationObject.json","parameterObject.json","operationObject.json","apiDeclaration.json"]),this.validators["resourceListing.json"]=createValidator(this,["resourceObject.json","infoObject.json","oauth2GrantType.json","authorizationObject.json","resourceListing.json"]);break;case"2.0":this.schemas["schema.json"]=require("../schemas/2.0/schema.json"),this.validators["schema.json"]=createValidator(this,["schema.json"])}},getModelMetadata=function(e,r){var a=e[r];return _.isUndefined(a)&&(a=e[r]={composed:{},name:void 0,parents:[],refs:[],schema:void 0}),a},processModel=function e(r,a,t,n,i,s){var o=getModelMetadata(a,n);switch(o.schema=t,o.name=n,o.path=i,r.version){case"1.2":o.name=i[i.length-1],_.each(t.properties,function(e,t){var n=i.concat("properties",t);e.$ref?getModelMetadata(a,e.$ref).refs.push(n.concat(["$ref"])):"array"===e.type&&e.items.$ref&&getModelMetadata(a,e.items.$ref).refs.push(n.concat(["items","$ref"])),_.isUndefined(e.defaultValue)||validateParameterConstraints(r,e,e.defaultValue,n.concat("defaultValue"),s.errors)}),_.each(_.uniq(t.subTypes),function(e,r){var t=getModelMetadata(a,e);t.parents.push(n),t.refs.push(i.concat("subTypes",r.toString()))});break;case"2.0":_.each(_.uniq(t.allOf),function(t,n){var c=i.concat("allOf",n.toString());_.isUndefined(t.$ref)?(e(r,a,t,toJsonPointer(c),c,s),o.parents.push(toJsonPointer(c))):(o.parents.push(refToJsonPointer(t.$ref)),getModelMetadata(a,refToJsonPointer(t.$ref)).refs.push(c.concat("$ref")))}),_.isUndefined(t.default)||validateParameterConstraints(r,t,t.defaultValue,i.concat("default"),s.errors),t.$ref?getModelMetadata(a,refToJsonPointer(t.$ref)).refs.push(i.concat(["$ref"])):"array"===t.type&&(t.items.$ref?getModelMetadata(a,refToJsonPointer(t.items.$ref)).refs.push(i.concat(["items","$ref"])):_.isUndefined(t.items.type)||-1!==r.primitives.indexOf(t.items.type)||_.each(t.items,function(t,n){var o=i.concat("items",n.toString());e(r,a,t,toJsonPointer(o),o,s)})),_.each(t.properties,function(t,n){var o=i.concat("properties",n);t.$ref?getModelMetadata(a,refToJsonPointer(t.$ref)).refs.push(o.concat(["$ref"])):"array"===t.type&&(t.items.$ref?getModelMetadata(a,refToJsonPointer(t.items.$ref)).refs.push(o.concat(["items","$ref"])):_.isUndefined(t.items.type)||-1!==r.primitives.indexOf(t.items.type)||_.each(t.items,function(t,n){var i=o.concat("items",n.toString());e(r,a,t,toJsonPointer(i),i,s)}))}),-1===toJsonPointer(i).indexOf("#/definitions/")&&o.refs.push(i)}},getModelsMetadata=function(e,r,a){var t,n={},i={errors:[],warnings:[]},s={},o={},c=function(r,a){var n=t[r].schema;n&&(_.each(n.properties,function(t,n){var s=_.cloneDeep(t);a.properties[n]?createErrorOrWarning("CHILD_MODEL_REDECLARES_PROPERTY","Child model declares property already declared by ancestor: "+n,t,"1.2"===e.version?["models",r,"properties",n]:r.substring(2).split("/").concat("properties",n),i.errors):("1.2"===e.version&&(_.isUndefined(s.maximum)||(s.maximum=parseFloat(s.maximum)),_.isUndefined(s.minimum)||(s.minimum=parseFloat(s.minimum))),a.properties[n]=s)}),!_.isUndefined(n.required)&&_.isUndefined(a.required)&&(a.required=[]),_.each(n.required,function(e){-1===a.required.indexOf(e)&&a.required.push(e)}))},d=function(e,r){var a=!1;return Object.keys(r).filter(function(t){return t===e&&(a=!0),a&&r[t]})},u=function p(r,a,n,s,o){var u=t[r],h=u.schema;s[r]=!0,_.isUndefined(h)||(u.parents.length>1&&"1.2"===e.version?createErrorOrWarning("MULTIPLE_MODEL_INHERITANCE","Child model is sub type of multiple models: "+u.parents.join(" && "),h,["models",r],i.errors):_.each(u.parents,function(t){n[t]||(s[t]&&(a[r]=d(t,s),createErrorOrWarning("CYCLICAL_MODEL_INHERITANCE","Model has a circular inheritance: "+r+" -> "+a[r].join(" -> "),"1.2"===e.version?h.subTypes:h.allOf,"1.2"===e.version?["models",r,"subTypes"]:r.substring(2).split("/").concat("allOf"),i.errors)),a[r]||p(t,a,n,s,o)),a[r]||c(t,o)})),n[r]=!0,s[r]=!1},h=md5.hash(JSON.stringify(r)),m=metadataCache[h];if(_.isUndefined(m)){switch(m=metadataCache[h]={metadata:{},results:i},t=m.metadata,e.version){case"1.2":_.reduce(r.models,function(r,a,n){return validateNoExist(r,a.id,"MODEL_DEFINITION","Model",["models",n,"id"],i.errors),processModel(e,t,a,a.id,["models",n],i),r.concat(a.id)},[]);break;case"2.0":_.each(r.definitions,function(r,a){var n=["definitions",a];processModel(e,t,r,toJsonPointer(n),n,i)})}_.each(t,function(e,r){e.composed={title:"Composed "+r,type:"object",properties:{}},_.isUndefined(e.schema)||(u(r,n,s,o,e.composed),c(r,e.composed)),_.isUndefined(e.schema.required)||_.each(e.schema.required,function(r,t){_.isUndefined(e.composed.properties[r])&&createErrorOrWarning("MISSING_REQUIRED_MODEL_PROPERTY","Model requires property but it is not defined: "+r,r,e.path.concat(["required",t.toString()]),a.errors)})}),_.each(t,function(r){var a=traverse(r.composed).reduce(function(r){return"$ref"===this.key&&(r[toJsonPointer(this.path)]="1.2"===e.version?this.node:refToJsonPointer(this.node)),r},{});_.each(a,function(e,a){var n=a.substring(2).split("/"),i=_.isUndefined(t[e])?void 0:_.cloneDeep(t[e].composed);_.isUndefined(i)||(delete i.id,delete i.title,traverse(r.composed).set(n.slice(0,n.length-1),i))})}),_.isUndefined(a)||_.each(i,function(e,r){a[r]=a[r].concat(e)})}return m},validateWithSchema=function(e,r,a){var t=e.validators[r],n=t.schema[r],i=t.validate(n,a),s={errors:[],warnings:[]};return i&&(s={errors:t.je(n,a,i,jjveOptions),warnings:[]}),s},validateContent=function(e,r,a){var t={errors:[],warnings:[]},n={},i={},s=[],o=[];switch(e.version){case"1.2":_.each(r.apis,function(e,r){validateNoExist(s,e.path,"RESOURCE_PATH","Resource path",["apis",r.toString(),"path"],t.errors),-1===s.indexOf(e.path)&&s.push(e.path)}),0===t.errors.length&&(_.each(r.authorizations,function(e,r){n[r]=_.map(e.scopes,function(e){return e.scope})},{}),t.apiDeclarations=[],_.each(a,function(r,a){var c=t.apiDeclarations[a]={errors:[],warnings:[]},d={},u={},h=getModelsMetadata(e,r,c).metadata,m=function(e,r){var a=getModelMetadata(h,e);a.refs.push(r)},p=function(e,r){var a;_.isUndefined(d[e])?(a=i[e],_.isUndefined(a)&&(a=i[e]=[])):(a=u[e],_.isUndefined(a)&&(a=u[e]=[])),-1===a.indexOf(r)&&a.push(r)};_.each(r.authorizations,function(e,r){d[r]=_.map(e.scopes,function(e){return e.scope})},{}),validateNoExist(o,r.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],c.errors),validateExist(s,r.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],c.errors),-1===o.indexOf(r.resourcePath)&&o.push(r.resourcePath),_.each(["consumes","produces"],function(e){validateNoDuplicates(r[e],"API_"+e.toUpperCase(),"API",[e],c.warnings)}),_.reduce(r.apis,function(r,a,t){var i=["apis",t.toString()],s=normalizePath(a.path),o=[];return r.indexOf(s.path)>-1&&createErrorOrWarning("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+a.path,a.path,i.concat("path"),c.errors),_.reduce(a.operations,function(r,t,u){var h=i.concat(["operations",u.toString()]);return _.each(["consumes","produces"],function(e){validateNoDuplicates(t[e],"OPERATION_"+e.toUpperCase(),"Operation",h.concat(e),c.warnings)}),validateNoExist(r,t.method,"OPERATION_METHOD","Operation method",h.concat("method"),c.errors),_.each(t.authorizations,function(e,r){validateExist(_.uniq(Object.keys(d).concat(Object.keys(n))),r,"AUTHORIZATION","Authorization",h.concat(["authorizations",r]),c.errors),_.each(e,function(e,a){_.isUndefined(d[r])&&_.isUndefined(n[r])||validateExist(_.uniq((d[r]||[]).concat(n[r]||[])),e.scope,"AUTHORIZATION_SCOPE","Authorization scope",h.concat(["authorizations",r,a.toString(),"scope"]),c.errors),p(r,e.scope)})}),_.reduce(t.parameters,function(r,a,t){return-1===e.primitives.indexOf(a.type)?m(a.type,h.concat(["parameters",t.toString(),"type"])):"array"===a.type&&a.items.$ref&&m(a.items.$ref,h.concat(["parameters",t.toString(),"items","$ref"])),validateNoExist(r,a.name,"OPERATION_PARAMETER","Operation parameter",h.concat("parameters",t.toString(),"name"),c.errors),"path"===a.paramType&&(-1===s.args.indexOf(a.name)&&createErrorOrWarning("UNRESOLVABLE_API_PATH_PARAMETER","API path parameter could not be resolved: "+a.name,a.name,h.concat("parameters",t.toString(),"name"),c.errors),-1===o.indexOf(a.name)&&o.push(a.name)),_.isUndefined(a.defaultValue)||validateParameterConstraints(e,a,a.defaultValue,h.concat("parameters",t.toString(),"defaultValue"),c.errors),r.concat(a.name)},[]),_.each(_.difference(s.args,o),function(e){createErrorOrWarning("MISSING_API_PATH_PARAMETER","API requires path parameter but it is not defined: "+e,a.path,i.concat("path"),c.errors)}),_.reduce(t.responseMessages,function(e,r,a){return validateNoExist(e,r.code,"RESPONSE_MESSAGE_CODE","Response message code",h.concat(["responseMessages",a.toString(),"code"]),c.errors),r.responseModel&&m(r.responseModel,h.concat(["responseMessages",a.toString(),"responseModel"])),e.concat(r.code)},[]),"array"===t.type&&t.items.$ref?m(t.items.$ref,h.concat(["items","$ref"])):-1===e.primitives.indexOf(t.type)&&m(t.type,h.concat(["type"])),r.concat(t.method)},[]),r.concat(s.path)},[]),_.each(h,function(e,r){_.isUndefined(e.schema)&&_.each(e.refs,function(e){createErrorOrWarning("UNRESOLVABLE_MODEL","Model could not be resolved: "+r,r,e,c.errors)}),0===e.refs.length&&createUnusedErrorOrWarning(e.schema,r,"MODEL","Model",["models",e.name],c.warnings)}),_.each(_.difference(Object.keys(d),Object.keys(u)),function(e){createUnusedErrorOrWarning(r.authorizations[e],e,"AUTHORIZATION","Authorization",["authorizations",e],c.warnings)}),_.each(d,function(e,a){var t=["authorizations",a],n=r.authorizations[a];_.each(_.difference(e,u[a]||[]),function(r){var a=e.indexOf(r);createUnusedErrorOrWarning(n.scopes[a],r,"AUTHORIZATION_SCOPE","Authorization scope",t.concat(["scopes",a.toString()]),c.warnings)})})}),_.each(_.difference(s,o),function(e){var a=_.map(r.apis,function(e){return e.path}).indexOf(e);createUnusedErrorOrWarning(r.apis[a].path,e,"RESOURCE_PATH","Resource path",["apis",a.toString(),"path"],t.errors)}),_.each(_.difference(Object.keys(n),Object.keys(i)),function(e){createUnusedErrorOrWarning(r.authorizations[e],e,"AUTHORIZATION","Authorization",["authorizations",e],t.warnings)}),_.each(i,function(e,a){var n=["authorizations",a];_.each(_.difference(e,i[a]),function(i){var s=e.indexOf(i);createUnusedErrorOrWarning(r.authorizations[a].scopes[s],i,"AUTHORIZATION_SCOPE","Authorization scope",n.concat(["scopes",s.toString()]),t.warnings)})}));break;case"2.0":if(_.each(["consumes","produces","schemes"],function(e){validateNoDuplicates(r[e],"API_"+e.toUpperCase(),"API",[e],t.warnings)}),0===t.errors.length&&0===t.warnings.length){var c=getModelsMetadata(e,r,t).metadata;_.reduce(r.paths,function(r,a,n){var i=["paths",n],s=normalizePath(n),o=[];return r.indexOf(s.path)>-1&&createErrorOrWarning("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+n,n,i,t.errors),_.each(a,function(r,n){var d=i.concat(n);return"parameters"===n?void _.reduce(a.parameters,function(r,a,n){var i=d.concat(n.toString());return validateNoExist(r,a.name,"API_PARAMETER","API parameter",i.concat("name"),t.errors),"path"===a.in&&(-1===s.args.indexOf(a.name)&&createErrorOrWarning("UNRESOLVABLE_API_PATH_PARAMETER","API path parameter could not be resolved: "+a.name,a.name,i.concat("name"),t.errors),-1===o.indexOf(a.name)&&o.push(a.name)),_.isUndefined(a.schema)||processModel(e,c,a.schema,toJsonPointer(i.concat("schema")),i.concat("schema"),t),r.concat(a.name)},[]):(_.each(["consumes","produces","schemes"],function(e){validateNoDuplicates(r[e],"OPERATION_"+e.toUpperCase(),"Operation",d.concat(e),t.warnings)}),_.reduce(r.parameters,function(r,a,n){var i=d.concat("parameters",n.toString());return validateNoExist(r,a.name,"OPERATION_PARAMETER","Operation parameter",i.concat("name"),t.errors),"path"===a.in&&(-1===s.args.indexOf(a.name)&&createErrorOrWarning("UNRESOLVABLE_API_PATH_PARAMETER","API path parameter could not be resolved: "+a.name,a.name,i.concat("name"),t.errors),-1===o.indexOf(a.name)&&o.push(a.name)),_.isUndefined(a.schema)||processModel(e,c,a.schema,toJsonPointer(i.concat("schema")),i.concat("schema"),t),r.concat(a.name)},[]),void _.each(r.responses,function(r,a){var t=d.concat("responses",a);_.isUndefined(r.schema)||processModel(e,c,r.schema,toJsonPointer(t.concat("schema")),t.concat("schema"),r)}))}),_.each(_.difference(s.args,o),function(e){createErrorOrWarning("MISSING_API_PATH_PARAMETER","API requires path parameter but it is not defined: "+e,n,i,t.errors)}),r.concat(s.path)},[]),_.each(c,function(e,r){_.isUndefined(e.schema)&&_.each(e.refs,function(e){createErrorOrWarning("UNRESOLVABLE_MODEL","Model could not be resolved: "+r,r,e,t.errors)}),0===e.refs.length&&createUnusedErrorOrWarning(e.schema,r,"MODEL","Model",r.substring(2).split("/"),t.warnings)})}}return t};Specification.prototype.validate=function(e,r){var a={errors:[],warnings:[]},t=!1;switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("resourceListing is required");if(!_.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(_.isUndefined(r))throw new Error("apiDeclarations is required");if(!_.isArray(r))throw new TypeError("apiDeclarations must be an array");a=validateWithSchema(this,"resourceListing.json",e),a.errors.length>0&&(t=!0),t||(a.apiDeclarations=[],_.each(r,function(e,r){return a.apiDeclarations[r]=validateWithSchema(this,"apiDeclaration.json",e),a.apiDeclarations[r].errors.length>0?(t=!0,!1):void 0}.bind(this))),t||(a=validateContent(this,e,r)),a=a.errors.length>0||a.warnings.length>0||_.reduce(a.apiDeclarations,function(e,r){return e+(_.isArray(r.errors)?r.errors.length:0)+(_.isArray(r.warnings)?r.warnings.length:0)},0)>0?a:void 0;break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object");a=validateWithSchema(this,"schema.json",e),a.errors.length>0&&(t=!0),t||(a=validateContent(this,e)),a=a.errors.length>0||a.warnings.length>0?a:void 0}return a},Specification.prototype.composeModel=function(e,r){var a,t,n,i;switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("apiDeclaration is required");if(!_.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(_.isUndefined(r))throw new Error("modelId is required");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(_.isUndefined(r))throw new Error("modelIdOrPath is required")}if(a=getModelsMetadata(this,e),n=a.metadata,a.results.errors.length>0)throw i=new Error("The models are invalid and model composition is not possible"),i.errors=a.results.errors,i.warnings=a.results.warnings,i;return t=n["1.2"===this.version?r:refToJsonPointer(r)],_.isUndefined(t)?void 0:t.composed},Specification.prototype.validateModel=function(e,r,a){var t,n,i=this.composeModel(e,r);if(_.isUndefined(i))throw Error("Unable to compose model so validation is not possible");return n=jjv(jjvOptions),n.addFormat("uri",function(){return!0}),n.addSchema(draft04Url,draft04Json),n.je=jjve(n),t=n.validate(i,a),t=t?{errors:n.je(i,a,t,jjveOptions)}:void 0},module.exports.v1=module.exports.v1_2=new Specification("1.2"),module.exports.v2=module.exports.v2_0=new Specification("2.0");
},{"../schemas/1.2/apiDeclaration.json":322,"../schemas/1.2/authorizationObject.json":323,"../schemas/1.2/dataType.json":324,"../schemas/1.2/dataTypeBase.json":325,"../schemas/1.2/infoObject.json":326,"../schemas/1.2/modelsObject.json":327,"../schemas/1.2/oauth2GrantType.json":328,"../schemas/1.2/operationObject.json":329,"../schemas/1.2/parameterObject.json":330,"../schemas/1.2/resourceListing.json":331,"../schemas/1.2/resourceObject.json":332,"../schemas/2.0/schema.json":333,"../schemas/json-schema-draft-04.json":334,"./helpers":2,"./validators":3,"jjv":4,"jjve":6,"lodash.clonedeep":7,"lodash.difference":49,"lodash.foreach":65,"lodash.isarray":94,"lodash.isplainobject":101,"lodash.isundefined":123,"lodash.map":124,"lodash.reduce":185,"lodash.union":246,"lodash.uniq":267,"spark-md5":320,"traverse":321}],2:[function(require,module,exports){
"use strict";var _={isUndefined:require("lodash.isundefined")},specCache={};module.exports.getSpec=function(e){var r=specCache[e];if(_.isUndefined(r))switch(e){case"1.2":r=require("../lib/specs").v1_2;break;case"2.0":r=require("../lib/specs").v2_0}return r},module.exports.refToJsonPointer=function(e){return"#"!==e.charAt(0)&&(e="#/definitions/"+e),e},module.exports.toJsonPointer=function(e){return"#/"+e.map(function(e){return e.replace(/\//g,"~1")}).join("/")};
},{"../lib/specs":undefined,"lodash.isundefined":123}],3:[function(require,module,exports){
"use strict";var _={each:require("lodash.foreach"),isArray:require("lodash.isarray"),isBoolean:require("lodash.isboolean"),isNaN:require("lodash.isnan"),isNull:require("lodash.isnull"),isString:require("lodash.isstring"),isUndefined:require("lodash.isundefined"),union:require("lodash.union"),uniq:require("lodash.uniq")},helpers=require("./helpers"),dateRegExp=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/,dateTimeRegExp=/^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/,throwInvalidParameter=function(e,i){var a=new Error("Parameter ("+e+") "+i);throw a.failedValidation=!0,a},isValidDate=function(e){var i,a,n;return _.isString(e)||(e=e.toString()),a=dateRegExp.exec(e),null===a?!1:(i=a[3],n=a[2],"01">n||n>"12"||"01">i||i>"31"?!1:!0)},isValidDateTime=function(e){var i,a,n,t,r,o,d;return _.isString(e)||(e=e.toString()),o=e.toLowerCase().split("t"),a=o[0],n=o.length>1?o[1]:void 0,isValidDate(a)?(t=dateTimeRegExp.exec(n),null===t?!1:(i=t[1],r=t[2],d=t[3],i>"23"||r>"59"||d>"59"?!1:!0)):!1};module.exports.validateContentType=function(e,i,a){var n=a.headers["content-type"]||"application/octet-stream",t=_.union(i,e);if(n=n.split(";")[0],t.length>0&&-1!==["POST","PUT"].indexOf(a.method)&&-1===t.indexOf(n))throw new Error("Invalid content type ("+n+").  These are valid: "+t.join(", "))},module.exports.validateEnum=function(e,i,a){_.isUndefined(a)||_.isUndefined(i)||-1!==a.indexOf(i)||throwInvalidParameter(e,"is not an allowable value ("+a.join(", ")+"): "+i)},module.exports.validateMaximum=function(e,i,a,n,t){var r,o;_.isUndefined(t)&&(t=!1),"integer"===n?o=parseInt(i,10):"number"===n&&(o=parseFloat(i)),_.isUndefined(a)||(r=parseFloat(a),t&&o>=r?throwInvalidParameter(e,"is greater than or equal to the configured maximum ("+a+"): "+i):o>r&&throwInvalidParameter(e,"is greater than the configured maximum ("+a+"): "+i))},module.exports.validateMaxItems=function(e,i,a){!_.isUndefined(a)&&i.length>a&&throwInvalidParameter(e,"contains more items than allowed: "+a)},module.exports.validateMaxLength=function(e,i,a){!_.isUndefined(a)&&i.length>a&&throwInvalidParameter(e,"is longer than allowed: "+a)},module.exports.validateMinimum=function(e,i,a,n,t){var r,o;_.isUndefined(t)&&(t=!1),"integer"===n?o=parseInt(i,10):"number"===n&&(o=parseFloat(i)),_.isUndefined(a)||(r=parseFloat(a),t&&r>=o?throwInvalidParameter(e,"is less than or equal to the configured minimum ("+a+"): "+i):r>o&&throwInvalidParameter(e,"is less than the configured minimum ("+a+"): "+i))},module.exports.validateMinItems=function(e,i,a){!_.isUndefined(a)&&i.length<a&&throwInvalidParameter(e,"contains fewer items than allowed: "+a)},module.exports.validateMinLength=function(e,i,a){!_.isUndefined(a)&&i.length<a&&throwInvalidParameter(e,"is shorter than allowed: "+a)},module.exports.validateModel=function(e,i,a,n,t){var r=helpers.getSpec(a),o=function(i){var a=r.validateModel(n,t,i);if(!_.isUndefined(a))try{throwInvalidParameter(e,"is not a valid "+t+" model")}catch(o){throw o.errors=a.errors,o}};_.isArray(i)?_.each(i,function(e){o(e)}):o(i)},module.exports.validatePattern=function(e,i,a){!_.isUndefined(a)&&_.isNull(i.match(new RegExp(a)))&&throwInvalidParameter(e,"does not match required pattern: "+a)},module.exports.validateRequiredness=function(e,i,a){!_.isUndefined(a)&&a===!0&&_.isUndefined(i)&&throwInvalidParameter(e,"is required")},module.exports.validateTypeAndFormat=function e(i,a,n,t,r){var o=!0;if(_.isArray(a))_.each(a,function(a,r){e(i,a,n,t,!0)||throwInvalidParameter(i,"at index "+r+" is not a valid "+n+": "+a)});else switch(n){case"boolean":o=_.isBoolean(a)||-1!==["false","true"].indexOf(a);break;case"integer":o=!_.isNaN(parseInt(a,10));break;case"number":o=!_.isNaN(parseFloat(a));break;case"string":if(!_.isUndefined(t))switch(t){case"date":o=isValidDate(a);break;case"date-time":o=isValidDateTime(a)}}return r?o:void(o||throwInvalidParameter(i,"is not a valid "+(_.isUndefined(t)?"":t+" ")+n+": "+a))},module.exports.validateUniqueItems=function(e,i,a){_.isUndefined(a)||_.uniq(i).length===i.length||throwInvalidParameter(e,"does not allow duplicate values: "+i.join(", "))};
},{"./helpers":2,"lodash.foreach":65,"lodash.isarray":94,"lodash.isboolean":96,"lodash.isnan":98,"lodash.isnull":99,"lodash.isstring":122,"lodash.isundefined":123,"lodash.union":246,"lodash.uniq":267}],4:[function(require,module,exports){
module.exports=require("./lib/jjv.js");
},{"./lib/jjv.js":5}],5:[function(require,module,exports){
(function(){function e(){return this instanceof e?(this.coerceType={},this.fieldType=t(o),this.fieldValidate=t(f),this.fieldFormat=t(a),this.defaultOptions=t(p),void(this.schema={})):new e}var t=function(e){if(null===e||"object"!=typeof e)return e;var r;if(e instanceof Date)return r=new Date,r.setTime(e.getTime()),r;if(e instanceof RegExp)return r=new RegExp(e);if(e instanceof Array){r=[];for(var n=0,i=e.length;i>n;n++)r[n]=t(e[n]);return r}if(e instanceof Object){r={};for(var o in e)e.hasOwnProperty(o)&&(r[o]=t(e[o]));return r}throw new Error("Unable to clone object!")},r=function(e){for(var r=[t(e[0])],n=r[0].key,i=r[0].object,o=1,a=e.length;a>o;o++)i=i[n],n=e[o].key,r.push({object:i,key:n});return r},n=function(e,t){var r=e.length-1,n=e[r].key;t[r].object[n]=e[r].object[n]},i={type:!0,not:!0,anyOf:!0,allOf:!0,oneOf:!0,$ref:!0,$schema:!0,id:!0,exclusiveMaximum:!0,exclusiveMininum:!0,properties:!0,patternProperties:!0,additionalProperties:!0,items:!0,additionalItems:!0,required:!0,"default":!0,title:!0,description:!0,definitions:!0,dependencies:!0},o={"null":function(e){return null===e},string:function(e){return"string"==typeof e},"boolean":function(e){return"boolean"==typeof e},number:function(e){return"number"==typeof e&&e===e},integer:function(e){return"number"==typeof e&&e%1===0},object:function(e){return e&&"object"==typeof e&&!Array.isArray(e)},array:function(e){return Array.isArray(e)},date:function(e){return e instanceof Date}},a={alpha:function(e){return/^[a-zA-Z]+$/.test(e)},alphanumeric:function(e){return/^[a-zA-Z0-9]+$/.test(e)},identifier:function(e){return/^[-_a-zA-Z0-9]+$/.test(e)},hexadecimal:function(e){return/^[a-fA-F0-9]+$/.test(e)},numeric:function(e){return/^[0-9]+$/.test(e)},"date-time":function(e){return!isNaN(Date.parse(e))&&-1===e.indexOf("/")},uppercase:function(e){return e===e.toUpperCase()},lowercase:function(e){return e===e.toLowerCase()},hostname:function(e){return e.length<256&&/^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])(\.([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]))*$/.test(e)},uri:function(e){return/[-a-zA-Z0-9@:%_\+.~#?&//=]{2,256}\.[a-z]{2,4}\b(\/[-a-zA-Z0-9@:%_\+.~#?&//=]*)?/.test(e)},email:function(e){return/^(?:[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+\.)*[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+@(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!\.)){0,61}[a-zA-Z0-9]?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!$)){0,61}[a-zA-Z0-9]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\]))$/.test(e)},ipv4:function(e){if(/^(\d?\d?\d)\.(\d?\d?\d)\.(\d?\d?\d)\.(\d?\d?\d)$/.test(e)){var t=e.split(".").sort();if(t[3]<=255)return!0}return!1},ipv6:function(e){return/^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/.test(e)}},f={readOnly:function(){return!1},minimum:function(e,t,r){return!(t>e||r.exclusiveMinimum&&t>=e)},maximum:function(e,t,r){return!(e>t||r.exclusiveMaximum&&e>=t)},multipleOf:function(e,t){return e/t%1===0||"number"!=typeof e},pattern:function(e,t){if("string"!=typeof e)return!0;var r,n;"string"==typeof t?r=t:(r=t[0],n=t[1]);var i=new RegExp(r,n);return i.test(e)},minLength:function(e,t){return e.length>=t||"string"!=typeof e},maxLength:function(e,t){return e.length<=t||"string"!=typeof e},minItems:function(e,t){return e.length>=t||!Array.isArray(e)},maxItems:function(e,t){return e.length<=t||!Array.isArray(e)},uniqueItems:function(e){for(var t,r={},n=0,i=e.length;i>n;n++){if(t=JSON.stringify(e[n]),r.hasOwnProperty(t))return!1;r[t]=!0}return!0},minProperties:function(e,t){if("object"!=typeof e)return!0;var r=0;for(var n in e)e.hasOwnProperty(n)&&(r+=1);return r>=t},maxProperties:function(e,t){if("object"!=typeof e)return!0;var r=0;for(var n in e)e.hasOwnProperty(n)&&(r+=1);return t>=r},constant:function(e,t){return JSON.stringify(e)==JSON.stringify(t)},"enum":function(e,t){var r,n,i;if("object"==typeof e){for(i=JSON.stringify(e),r=0,n=t.length;n>r;r++)if(i===JSON.stringify(t[r]))return!0}else for(r=0,n=t.length;n>r;r++)if(e===t[r])return!0;return!1}},s=function(e){return-1===e.indexOf("://")?e:e.split("#")[0]},u=function(e,t,r){var n,i,o,a;if(o=r.indexOf("#"),-1===o)return e.schema.hasOwnProperty(r)?[e.schema[r]]:null;if(o>0)if(a=r.substr(0,o),r=r.substr(o+1),e.schema.hasOwnProperty(a))t=[e.schema[a]];else{if(!t||t[0].id!==a)return null;t=[t[0]]}else{if(!t)return null;r=r.substr(1)}if(""===r)return[t[0]];if("/"===r.charAt(0)){for(r=r.substr(1),n=t[0],i=r.split("/");i.length>0;){if(!n.hasOwnProperty(i[0]))return null;n=n[i[0]],t.push(n),i.shift()}return t}return null},c=function(e,t){var r,n,i,o,a=e.length-1,f=/^(\d+)/.exec(t);if(f){if(t=t.substr(f[0].length),i=parseInt(f[1],10),0>i||i>a)return;if(o=e[a-i],"#"===t)return o.key}else o=e[0];if(n=o.object[o.key],""===t)return n;if("/"===t.charAt(0)){for(t=t.substr(1),r=t.split("/");r.length>0;){if(r[0]=r[0].replace(/~1/g,"/").replace(/~0/g,"~"),!n.hasOwnProperty(r[0]))return;n=n[r[0]],r.shift()}return n}},l=function(e,t,o,a){var f,s,p,d,h,y,m,O,g,w,P,b,A,v=!1,j={},k=t.length-1,$=t[k],x=o.length-1,z=o[x].object,Z=o[x].key,I=z[Z];if($.hasOwnProperty("$ref"))return t=u(e,t,$.$ref),t?l(e,t,o,a):{$ref:$.$ref};if($.hasOwnProperty("type"))if("string"==typeof $.type){if(a.useCoerce&&e.coerceType.hasOwnProperty($.type)&&(I=z[Z]=e.coerceType[$.type](I)),!e.fieldType[$.type](I))return{type:$.type}}else{for(v=!0,f=0,s=$.type.length;s>f&&v;f++)e.fieldType[$.type[f]](I)&&(v=!1);if(v)return{type:$.type}}if($.hasOwnProperty("allOf"))for(f=0,s=$.allOf.length;s>f;f++)if(O=l(e,t.concat($.allOf[f]),o,a))return O;if(a.useCoerce||a.useDefault||a.removeAdditional){if($.hasOwnProperty("oneOf")){for(A=1/0,f=0,s=$.oneOf.length,p=0;s>f;f++)if(P=r(o),O=l(e,t.concat($.oneOf[f]),P,a))b=O.schema?Object.keys(O.schema).length:1,A>b&&(A=b,j=O);else{if(p+=1,p>1)break;n(P,o)}if(p>1)return{oneOf:!0};if(1>p)return j;j={}}if($.hasOwnProperty("anyOf")){for(j=null,A=1/0,f=0,s=$.anyOf.length;s>f;f++){if(P=r(o),O=l(e,t.concat($.anyOf[f]),P,a),!O){n(P,o),j=null;break}b=O.schema?Object.keys(O.schema).length:1,A>b&&(A=b,j=O)}if(j)return j}if($.hasOwnProperty("not")&&(P=r(o),O=l(e,t.concat($.not),P,a),!O))return{not:!0}}else{if($.hasOwnProperty("oneOf")){for(A=1/0,f=0,s=$.oneOf.length,p=0;s>f;f++)if(O=l(e,t.concat($.oneOf[f]),o,a))b=O.schema?Object.keys(O.schema).length:1,A>b&&(A=b,j=O);else if(p+=1,p>1)break;if(p>1)return{oneOf:!0};if(1>p)return j;j={}}if($.hasOwnProperty("anyOf")){for(j=null,A=1/0,f=0,s=$.anyOf.length;s>f;f++){if(O=l(e,t.concat($.anyOf[f]),o,a),!O){j=null;break}b=O.schema?Object.keys(O.schema).length:1,A>b&&(A=b,j=O)}if(j)return j}if($.hasOwnProperty("not")&&(O=l(e,t.concat($.not),o,a),!O))return{not:!0}}if($.hasOwnProperty("dependencies"))for(y in $.dependencies)if($.dependencies.hasOwnProperty(y)&&I.hasOwnProperty(y))if(Array.isArray($.dependencies[y])){for(f=0,s=$.dependencies[y].length;s>f;f++)if(!I.hasOwnProperty($.dependencies[y][f]))return{dependencies:!0}}else if(O=l(e,t.concat($.dependencies[y]),o,a))return O;if(Array.isArray(I)){if($.hasOwnProperty("items"))if(Array.isArray($.items)){for(f=0,s=$.items.length;s>f;f++)O=l(e,t.concat($.items[f]),o.concat({object:I,key:f}),a),null!==O&&(j[f]=O,v=!0);if(I.length>s&&$.hasOwnProperty("additionalItems"))if("boolean"==typeof $.additionalItems){if(!$.additionalItems)return{additionalItems:!0}}else for(f=s,s=I.length;s>f;f++)O=l(e,t.concat($.additionalItems),o.concat({object:I,key:f}),a),null!==O&&(j[f]=O,v=!0)}else for(f=0,s=I.length;s>f;f++)O=l(e,t.concat($.items),o.concat({object:I,key:f}),a),null!==O&&(j[f]=O,v=!0);else if($.hasOwnProperty("additionalItems")&&"boolean"!=typeof $.additionalItems)for(f=0,s=I.length;s>f;f++)O=l(e,t.concat($.additionalItems),o.concat({object:I,key:f}),a),null!==O&&(j[f]=O,v=!0);if(v)return{schema:j}}else{g=[],j={};for(y in I)I.hasOwnProperty(y)&&g.push(y);if(a.checkRequired&&$.required)for(f=0,s=$.required.length;s>f;f++)I.hasOwnProperty($.required[f])||(j[$.required[f]]={required:!0},v=!0);if(d=$.hasOwnProperty("properties"),h=$.hasOwnProperty("patternProperties"),d||h)for(f=g.length;f--;){if(w=!1,d&&$.properties.hasOwnProperty(g[f])&&(w=!0,O=l(e,t.concat($.properties[g[f]]),o.concat({object:I,key:g[f]}),a),null!==O&&(j[g[f]]=O,v=!0)),h)for(y in $.patternProperties)$.patternProperties.hasOwnProperty(y)&&g[f].match(y)&&(w=!0,O=l(e,t.concat($.patternProperties[y]),o.concat({object:I,key:g[f]}),a),null!==O&&(j[g[f]]=O,v=!0));w&&g.splice(f,1)}if(a.useDefault&&d&&!v)for(y in $.properties)$.properties.hasOwnProperty(y)&&!I.hasOwnProperty(y)&&$.properties[y].hasOwnProperty("default")&&(I[y]=$.properties[y]["default"]);if(a.removeAdditional&&d&&$.additionalProperties!==!0&&"object"!=typeof $.additionalProperties)for(f=0,s=g.length;s>f;f++)delete I[g[f]];else if($.hasOwnProperty("additionalProperties"))if("boolean"==typeof $.additionalProperties){if(!$.additionalProperties)for(f=0,s=g.length;s>f;f++)j[g[f]]={additional:!0},v=!0}else for(f=0,s=g.length;s>f;f++)O=l(e,t.concat($.additionalProperties),o.concat({object:I,key:g[f]}),a),null!==O&&(j[g[f]]=O,v=!0);if(v)return{schema:j}}for(m in $)$.hasOwnProperty(m)&&!i.hasOwnProperty(m)&&("format"===m?e.fieldFormat.hasOwnProperty($[m])&&!e.fieldFormat[$[m]](I,$,o,a)&&(j[m]=!0,v=!0):e.fieldValidate.hasOwnProperty(m)&&!e.fieldValidate[m](I,$[m].hasOwnProperty("$data")?c(o,$[m].$data):$[m],$,o,a)&&(j[m]=!0,v=!0));return v?j:null},p={useDefault:!1,useCoerce:!1,checkRequired:!0,removeAdditional:!1};e.prototype={validate:function(e,t,r){var n=[e],i=null,o=[{object:{__root__:t},key:"__root__"}];if("string"==typeof e&&(n=u(this,null,e),!n))throw new Error("jjv: could not find schema '"+e+"'.");if(r)for(var a in this.defaultOptions)this.defaultOptions.hasOwnProperty(a)&&!r.hasOwnProperty(a)&&(r[a]=this.defaultOptions[a]);else r=this.defaultOptions;return i=l(this,n,o,r),i?{validation:i.hasOwnProperty("schema")?i.schema:i}:null},resolveRef:function(e,t){return u(this,e,t)},addType:function(e,t){this.fieldType[e]=t},addTypeCoercion:function(e,t){this.coerceType[e]=t},addCheck:function(e,t){this.fieldValidate[e]=t},addFormat:function(e,t){this.fieldFormat[e]=t},addSchema:function(e,t){if(!t&&e&&(t=e,e=void 0),t.hasOwnProperty("id")&&"string"==typeof t.id&&t.id!==e){if("/"===t.id.charAt(0))throw new Error("jjv: schema id's starting with / are invalid.");this.schema[s(t.id)]=t}else if(!e)throw new Error("jjv: schema needs either a name or id attribute.");e&&(this.schema[s(e)]=t)}},"undefined"!=typeof module&&"undefined"!=typeof module.exports?module.exports=e:"function"==typeof define&&define.amd?define(function(){return e}):this.jjv=e}).call(this);
},{}],6:[function(require,module,exports){
(function(){"use strict";function e(s){var i=[],n=Object.keys(s.validation),r=n.every(function(e){return"object"!=typeof s.validation[e]||t(s.validation[e])});return n.forEach(r?function(e){var a,n;try{switch(e){case"type":var r=typeof s.data;"number"===r&&(""+s.data).match(/^\d+$/)?r="integer":"object"===r&&Array.isArray(s.data)&&(r="array"),a={code:"INVALID_TYPE",message:"Invalid type: "+r+" should be "+(t(s.validation[e])?"one of ":"")+s.validation[e]};break;case"required":n=s.ns,a={code:"OBJECT_REQUIRED",message:"Missing required property: "+n[n.length-1]};break;case"minimum":a={code:"MINIMUM",message:"Value "+s.data+" is less than minimum "+s.schema.minimum};break;case"maximum":a={code:"MAXIMUM",message:"Value "+s.data+" is greater than maximum "+s.schema.maximum};break;case"multipleOf":a={code:"MULTIPLE_OF",message:"Value "+s.data+" is not a multiple of "+s.schema.multipleOf};break;case"pattern":a={code:"PATTERN",message:"String does not match pattern: "+s.schema.pattern};break;case"minLength":a={code:"MIN_LENGTH",message:"String is too short ("+s.data.length+" chars), minimum "+s.schema.minLength};break;case"maxLength":a={code:"MAX_LENGTH",message:"String is too long ("+s.data.length+" chars), maximum "+s.schema.maxLength};break;case"minItems":a={code:"ARRAY_LENGTH_SHORT",message:"Array is too short ("+s.data.length+"), minimum "+s.schema.minItems};break;case"maxItems":a={code:"ARRAY_LENGTH_LONG",message:"Array is too long ("+s.data.length+"), maximum "+s.schema.maxItems};break;case"uniqueItems":a={code:"ARRAY_UNIQUE",message:"Array items are not unique"};break;case"minProperties":a={code:"OBJECT_PROPERTIES_MINIMUM",message:"Too few properties defined ("+Object.keys(s.data).length+"), minimum "+s.schema.minProperties};break;case"maxProperties":a={code:"OBJECT_PROPERTIES_MAXIMUM",message:"Too many properties defined ("+Object.keys(s.data).length+"), maximum "+s.schema.maxProperties};break;case"enum":a={code:"ENUM_MISMATCH",message:"No enum match ("+s.data+"), expects: "+s.schema["enum"].join(", ")};break;case"not":a={code:"NOT_PASSED",message:'Data matches schema from "not"'};break;case"additional":n=s.ns,a={code:"ADDITIONAL_PROPERTIES",message:"Additional properties not allowed: "+n[n.length-1]}}}catch(o){}if(!a){a={code:"FAILED",message:"Validation error: "+e};try{"boolean"!=typeof s.validation[e]&&(a.message=" ("+s.validation[e]+")")}catch(o){}}a.code="VALIDATION_"+a.code,void 0!==s.data&&(a.data=s.data),a.path=s.ns,i.push(a)}:function(t){var n;s.schema.$ref&&(s.schema=s.schema.$ref.match(/#\/definitions\//)?s.definitions[s.schema.$ref.slice(14)]:s.schema.$ref,"string"==typeof s.schema&&(s.schema=s.env.resolveRef(null,s.schema),s.schema&&(s.schema=s.schema[0]))),s.schema&&s.schema.type&&(a(s.schema,"object")&&(s.schema.properties&&s.schema.properties[t]&&(n=s.schema.properties[t]),!n&&s.schema.patternProperties&&Object.keys(s.schema.patternProperties).some(function(e){return t.match(new RegExp(e))?(n=s.schema.patternProperties[e],!0):void 0}),!n&&s.schema.hasOwnProperty("additionalProperties")&&(n="boolean"==typeof s.schema.additionalProperties?{}:s.schema.additionalProperties)),a(s.schema,"array")&&(n=s.schema.items));var r={env:s.env,schema:n||{},ns:s.ns.concat(t)};try{r.data=s.data[t]}catch(o){}try{r.validation=s.validation[t].schema?s.validation[t].schema:s.validation[t]}catch(o){r.validation={}}try{r.definitions=n.definitions||s.definitions}catch(o){r.definitions=s.definitions}i=i.concat(e(r))}),i}function a(e,a){return"string"==typeof e.type?e.type===a:t(e.type)?-1!==e.type.indexOf(a):!1}function t(e){return"function"==typeof Array.isArray?Array.isArray(e):"[object Array]"===Object.prototype.toString.call(e)}function s(e){var a=e.hasOwnProperty("root")?e.root:"$",t=e.hasOwnProperty("sep")?e.sep:".";return function(e){var s=a;return e.path.forEach(function(e){s+=e.match(/^\d+$/)?"["+e+"]":e.match(/^[A-Z_$][0-9A-Z_$]*$/i)?t+e:"["+JSON.stringify(e)+"]"}),e.path=s,e}}function i(a){return function(t,i,n,r){if(!n||!n.validation)return[];r=r||{},"string"==typeof t&&(t=a.schema[t]);var o=e({env:a,schema:t,data:i,validation:n.validation,ns:[],definitions:t.definitions||{}});return o.length&&r.formatPath!==!1?o.map(s(r)):o}}"undefined"!=typeof module&&"undefined"!=typeof module.exports?module.exports=i:"function"==typeof define&&define.amd?define(function(){return i}):this.jjve=i}).call(this);
},{}],7:[function(require,module,exports){
function cloneDeep(e,a,l){return baseClone(e,!0,"function"==typeof a&&baseCreateCallback(a,l,1))}var baseClone=require("lodash._baseclone"),baseCreateCallback=require("lodash._basecreatecallback");module.exports=cloneDeep;
},{"lodash._baseclone":8,"lodash._basecreatecallback":27}],8:[function(require,module,exports){
function baseClone(s,e,a,r,l){if(a){var o=a(s);if("undefined"!=typeof o)return o}var t=isObject(s);if(!t)return s;var n=toString.call(s);if(!cloneableClasses[n])return s;var c=ctorByClass[n];switch(n){case boolClass:case dateClass:return new c(+s);case numberClass:case stringClass:return new c(s);case regexpClass:return o=c(s.source,reFlags.exec(s)),o.lastIndex=s.lastIndex,o}var C=isArray(s);if(e){var i=!r;r||(r=getArray()),l||(l=getArray());for(var b=r.length;b--;)if(r[b]==s)return l[b];o=C?c(s.length):{}}else o=C?slice(s):assign({},s);return C&&(hasOwnProperty.call(s,"index")&&(o.index=s.index),hasOwnProperty.call(s,"input")&&(o.input=s.input)),e?(r.push(s),l.push(o),(C?forEach:forOwn)(s,function(s,t){o[t]=baseClone(s,e,a,r,l)}),i&&(releaseArray(r),releaseArray(l)),o):o}var assign=require("lodash.assign"),forEach=require("lodash.foreach"),forOwn=require("lodash.forown"),getArray=require("lodash._getarray"),isArray=require("lodash.isarray"),isObject=require("lodash.isobject"),releaseArray=require("lodash._releasearray"),slice=require("lodash._slice"),reFlags=/\w*$/,argsClass="[object Arguments]",arrayClass="[object Array]",boolClass="[object Boolean]",dateClass="[object Date]",funcClass="[object Function]",numberClass="[object Number]",objectClass="[object Object]",regexpClass="[object RegExp]",stringClass="[object String]",cloneableClasses={};cloneableClasses[funcClass]=!1,cloneableClasses[argsClass]=cloneableClasses[arrayClass]=cloneableClasses[boolClass]=cloneableClasses[dateClass]=cloneableClasses[numberClass]=cloneableClasses[objectClass]=cloneableClasses[regexpClass]=cloneableClasses[stringClass]=!0;var objectProto=Object.prototype,toString=objectProto.toString,hasOwnProperty=objectProto.hasOwnProperty,ctorByClass={};ctorByClass[arrayClass]=Array,ctorByClass[boolClass]=Boolean,ctorByClass[dateClass]=Date,ctorByClass[funcClass]=Function,ctorByClass[objectClass]=Object,ctorByClass[numberClass]=Number,ctorByClass[regexpClass]=RegExp,ctorByClass[stringClass]=String,module.exports=baseClone;
},{"lodash._getarray":9,"lodash._releasearray":11,"lodash._slice":14,"lodash.assign":15,"lodash.foreach":65,"lodash.forown":20,"lodash.isarray":94,"lodash.isobject":25}],9:[function(require,module,exports){
function getArray(){return arrayPool.pop()||[]}var arrayPool=require("lodash._arraypool");module.exports=getArray;
},{"lodash._arraypool":10}],10:[function(require,module,exports){
var arrayPool=[];module.exports=arrayPool;
},{}],11:[function(require,module,exports){
function releaseArray(r){r.length=0,arrayPool.length<maxPoolSize&&arrayPool.push(r)}var arrayPool=require("lodash._arraypool"),maxPoolSize=require("lodash._maxpoolsize");module.exports=releaseArray;
},{"lodash._arraypool":12,"lodash._maxpoolsize":13}],12:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],13:[function(require,module,exports){
var maxPoolSize=40;module.exports=maxPoolSize;
},{}],14:[function(require,module,exports){
function slice(e,r,n){r||(r=0),"undefined"==typeof n&&(n=e?e.length:0);for(var o=-1,t=n-r||0,f=Array(0>t?0:t);++o<t;)f[o]=e[r+o];return f}module.exports=slice;
},{}],15:[function(require,module,exports){
var baseCreateCallback=require("lodash._basecreatecallback"),keys=require("lodash.keys"),objectTypes=require("lodash._objecttypes"),assign=function(e,a,r){var t,s=e,o=s;if(!s)return o;var n=arguments,f=0,l="number"==typeof r?2:n.length;if(l>3&&"function"==typeof n[l-2])var c=baseCreateCallback(n[--l-1],n[l--],2);else l>2&&"function"==typeof n[l-1]&&(c=n[--l]);for(;++f<l;)if(s=n[f],s&&objectTypes[typeof s])for(var y=-1,b=objectTypes[typeof s]&&keys(s),i=b?b.length:0;++y<i;)t=b[y],o[t]=c?c(o[t],s[t]):s[t];return o};module.exports=assign;
},{"lodash._basecreatecallback":27,"lodash._objecttypes":16,"lodash.keys":17}],16:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;
},{}],17:[function(require,module,exports){
var isNative=require("lodash._isnative"),isObject=require("lodash.isobject"),shimKeys=require("lodash._shimkeys"),nativeKeys=isNative(nativeKeys=Object.keys)&&nativeKeys,keys=nativeKeys?function(e){return isObject(e)?nativeKeys(e):[]}:shimKeys;module.exports=keys;
},{"lodash._isnative":18,"lodash._shimkeys":19,"lodash.isobject":25}],18:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;
},{}],19:[function(require,module,exports){
var objectTypes=require("lodash._objecttypes"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,shimKeys=function(e){var r,o=e,t=[];if(!o)return t;if(!objectTypes[typeof e])return t;for(r in o)hasOwnProperty.call(o,r)&&t.push(r);return t};module.exports=shimKeys;
},{"lodash._objecttypes":16}],20:[function(require,module,exports){
var baseCreateCallback=require("lodash._basecreatecallback"),keys=require("lodash.keys"),objectTypes=require("lodash._objecttypes"),forOwn=function(e,r,a){var t,o=e,s=o;if(!o)return s;if(!objectTypes[typeof o])return s;r=r&&"undefined"==typeof a?r:baseCreateCallback(r,a,3);for(var f=-1,l=objectTypes[typeof o]&&keys(o),n=l?l.length:0;++f<n;)if(t=l[f],r(o[t],t,e)===!1)return s;return s};module.exports=forOwn;
},{"lodash._basecreatecallback":27,"lodash._objecttypes":21,"lodash.keys":22}],21:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],22:[function(require,module,exports){
module.exports=require(17)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":17,"lodash._isnative":23,"lodash._shimkeys":24,"lodash.isobject":25}],23:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],24:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":19,"lodash._objecttypes":21}],25:[function(require,module,exports){
function isObject(e){return!(!e||!objectTypes[typeof e])}var objectTypes=require("lodash._objecttypes");module.exports=isObject;
},{"lodash._objecttypes":26}],26:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],27:[function(require,module,exports){
function baseCreateCallback(e,t,n){if("function"!=typeof e)return identity;if("undefined"==typeof t||!("prototype"in e))return e;var r=e.__bindData__;if("undefined"==typeof r&&(support.funcNames&&(r=!e.name),r=r||!support.funcDecomp,!r)){var i=fnToString.call(e);support.funcNames||(r=!reFuncName.test(i)),r||(r=reThis.test(i),setBindData(e,r))}if(r===!1||r!==!0&&1&r[1])return e;switch(n){case 1:return function(n){return e.call(t,n)};case 2:return function(n,r){return e.call(t,n,r)};case 3:return function(n,r,i){return e.call(t,n,r,i)};case 4:return function(n,r,i,a){return e.call(t,n,r,i,a)}}return bind(e,t)}var bind=require("lodash.bind"),identity=require("lodash.identity"),setBindData=require("lodash._setbinddata"),support=require("lodash.support"),reFuncName=/^\s*function[ \n\r\t]+\w/,reThis=/\bthis\b/,fnToString=Function.prototype.toString;module.exports=baseCreateCallback;
},{"lodash._setbinddata":28,"lodash.bind":31,"lodash.identity":46,"lodash.support":47}],28:[function(require,module,exports){
var isNative=require("lodash._isnative"),noop=require("lodash.noop"),descriptor={configurable:!1,enumerable:!1,value:null,writable:!1},defineProperty=function(){try{var e={},r=isNative(r=Object.defineProperty)&&r,t=r(e,e,e)&&r}catch(i){}return t}(),setBindData=defineProperty?function(e,r){descriptor.value=r,defineProperty(e,"__bindData__",descriptor)}:noop;module.exports=setBindData;
},{"lodash._isnative":29,"lodash.noop":30}],29:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],30:[function(require,module,exports){
function noop(){}module.exports=noop;
},{}],31:[function(require,module,exports){
function bind(e,r){return arguments.length>2?createWrapper(e,17,slice(arguments,2),null,r):createWrapper(e,1,null,null,r)}var createWrapper=require("lodash._createwrapper"),slice=require("lodash._slice");module.exports=bind;
},{"lodash._createwrapper":32,"lodash._slice":45}],32:[function(require,module,exports){
function createWrapper(e,r,a,i,s,p){var n=1&r,t=2&r,u=4&r,l=16&r,c=32&r;if(!t&&!isFunction(e))throw new TypeError;l&&!a.length&&(r&=-17,l=a=!1),c&&!i.length&&(r&=-33,c=i=!1);var h=e&&e.__bindData__;if(h&&h!==!0)return h=slice(h),h[2]&&(h[2]=slice(h[2])),h[3]&&(h[3]=slice(h[3])),!n||1&h[1]||(h[4]=s),!n&&1&h[1]&&(r|=8),!u||4&h[1]||(h[5]=p),l&&push.apply(h[2]||(h[2]=[]),a),c&&unshift.apply(h[3]||(h[3]=[]),i),h[1]|=r,createWrapper.apply(null,h);var o=1==r||17===r?baseBind:baseCreateWrapper;return o([e,r,a,i,s,p])}var baseBind=require("lodash._basebind"),baseCreateWrapper=require("lodash._basecreatewrapper"),isFunction=require("lodash.isfunction"),slice=require("lodash._slice"),arrayRef=[],push=arrayRef.push,unshift=arrayRef.unshift;module.exports=createWrapper;
},{"lodash._basebind":33,"lodash._basecreatewrapper":39,"lodash._slice":45,"lodash.isfunction":97}],33:[function(require,module,exports){
function baseBind(e){function a(){if(s){var e=slice(s);push.apply(e,arguments)}if(this instanceof a){var i=baseCreate(r.prototype),n=r.apply(i,e||arguments);return isObject(n)?n:i}return r.apply(t,e||arguments)}var r=e[0],s=e[2],t=e[4];return setBindData(a,e),a}var baseCreate=require("lodash._basecreate"),isObject=require("lodash.isobject"),setBindData=require("lodash._setbinddata"),slice=require("lodash._slice"),arrayRef=[],push=arrayRef.push;module.exports=baseBind;
},{"lodash._basecreate":34,"lodash._setbinddata":28,"lodash._slice":45,"lodash.isobject":37}],34:[function(require,module,exports){
(function(e){function n(e){return t(e)?i(e):{}}var o=require("lodash._isnative"),t=require("lodash.isobject"),i=(require("lodash.noop"),o(i=Object.create)&&i);i||(n=function(){function n(){}return function(o){if(t(o)){n.prototype=o;var i=new n;n.prototype=null}return i||e.Object()}}()),module.exports=n}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{});
},{"lodash._isnative":35,"lodash.isobject":37,"lodash.noop":36}],35:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],36:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],37:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":38}],38:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],39:[function(require,module,exports){
function baseCreateWrapper(e){function a(){var e=n?p:this;if(t){var b=slice(t);push.apply(b,arguments)}if((i||o)&&(b||(b=slice(arguments)),i&&push.apply(b,i),o&&b.length<u))return s|=16,baseCreateWrapper([r,c?s:-4&s,b,null,p,u]);if(b||(b=arguments),l&&(r=e[h]),this instanceof a){e=baseCreate(r.prototype);var d=r.apply(e,b);return isObject(d)?d:e}return r.apply(e,b)}var r=e[0],s=e[1],t=e[2],i=e[3],p=e[4],u=e[5],n=1&s,l=2&s,o=4&s,c=8&s,h=r;return setBindData(a,e),a}var baseCreate=require("lodash._basecreate"),isObject=require("lodash.isobject"),setBindData=require("lodash._setbinddata"),slice=require("lodash._slice"),arrayRef=[],push=arrayRef.push;module.exports=baseCreateWrapper;
},{"lodash._basecreate":40,"lodash._setbinddata":28,"lodash._slice":45,"lodash.isobject":43}],40:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":41,"lodash.isobject":43,"lodash.noop":42}],41:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],42:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],43:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":44}],44:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],45:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],46:[function(require,module,exports){
function identity(t){return t}module.exports=identity;
},{}],47:[function(require,module,exports){
(function(e){var n=require("lodash._isnative"),i=/\bthis\b/,o={};o.funcDecomp=!n(e.WinRTError)&&i.test(function(){return this}),o.funcNames="string"==typeof Function.name,module.exports=o}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{});
},{"lodash._isnative":48}],48:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],49:[function(require,module,exports){
function difference(e){return baseDifference(e,baseFlatten(arguments,!0,!0,1))}var baseDifference=require("lodash._basedifference"),baseFlatten=require("lodash._baseflatten");module.exports=difference;
},{"lodash._basedifference":50,"lodash._baseflatten":63}],50:[function(require,module,exports){
function baseDifference(e,r){var a=-1,c=baseIndexOf,s=e?e.length:0,i=s>=largeArraySize,f=[];if(i){var h=createCache(r);h?(c=cacheIndexOf,r=h):i=!1}for(;++a<s;){var l=e[a];c(r,l)<0&&f.push(l)}return i&&releaseObject(r),f}var baseIndexOf=require("lodash._baseindexof"),cacheIndexOf=require("lodash._cacheindexof"),createCache=require("lodash._createcache"),largeArraySize=require("lodash._largearraysize"),releaseObject=require("lodash._releaseobject");module.exports=baseDifference;
},{"lodash._baseindexof":51,"lodash._cacheindexof":52,"lodash._createcache":54,"lodash._largearraysize":59,"lodash._releaseobject":60}],51:[function(require,module,exports){
function baseIndexOf(e,n,r){for(var f=(r||0)-1,t=e?e.length:0;++f<t;)if(e[f]===n)return f;return-1}module.exports=baseIndexOf;
},{}],52:[function(require,module,exports){
function cacheIndexOf(e,r){var n=typeof r;if(e=e.cache,"boolean"==n||null==r)return e[r]?0:-1;"number"!=n&&"string"!=n&&(n="object");var a="number"==n?r:keyPrefix+r;return e=(e=e[n])&&e[a],"object"==n?e&&baseIndexOf(e,r)>-1?0:-1:e?0:-1}var baseIndexOf=require("lodash._baseindexof"),keyPrefix=require("lodash._keyprefix");module.exports=cacheIndexOf;
},{"lodash._baseindexof":51,"lodash._keyprefix":53}],53:[function(require,module,exports){
var keyPrefix="__1335248838000__";module.exports=keyPrefix;
},{}],54:[function(require,module,exports){
function createCache(e){var t=-1,r=e.length,c=e[0],a=e[r/2|0],h=e[r-1];if(c&&"object"==typeof c&&a&&"object"==typeof a&&h&&"object"==typeof h)return!1;var o=getObject();o["false"]=o["null"]=o["true"]=o.undefined=!1;var u=getObject();for(u.array=e,u.cache=o,u.push=cachePush;++t<r;)u.push(e[t]);return u}var cachePush=require("lodash._cachepush"),getObject=require("lodash._getobject"),releaseObject=require("lodash._releaseobject");module.exports=createCache;
},{"lodash._cachepush":55,"lodash._getobject":57,"lodash._releaseobject":60}],55:[function(require,module,exports){
function cachePush(e){var r=this.cache,c=typeof e;if("boolean"==c||null==e)r[e]=!0;else{"number"!=c&&"string"!=c&&(c="object");var o="number"==c?e:keyPrefix+e,u=r[c]||(r[c]={});"object"==c?(u[o]||(u[o]=[])).push(e):u[o]=!0}}var keyPrefix=require("lodash._keyprefix");module.exports=cachePush;
},{"lodash._keyprefix":56}],56:[function(require,module,exports){
module.exports=require(53)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/node_modules/lodash._keyprefix/index.js":53}],57:[function(require,module,exports){
function getObject(){return objectPool.pop()||{array:null,cache:null,criteria:null,"false":!1,index:0,"null":!1,number:null,object:null,push:null,string:null,"true":!1,undefined:!1,value:null}}var objectPool=require("lodash._objectpool");module.exports=getObject;
},{"lodash._objectpool":58}],58:[function(require,module,exports){
var objectPool=[];module.exports=objectPool;
},{}],59:[function(require,module,exports){
var largeArraySize=75;module.exports=largeArraySize;
},{}],60:[function(require,module,exports){
function releaseObject(e){var o=e.cache;o&&releaseObject(o),e.array=e.cache=e.criteria=e.object=e.number=e.string=e.value=null,objectPool.length<maxPoolSize&&objectPool.push(e)}var maxPoolSize=require("lodash._maxpoolsize"),objectPool=require("lodash._objectpool");module.exports=releaseObject;
},{"lodash._maxpoolsize":61,"lodash._objectpool":62}],61:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],62:[function(require,module,exports){
module.exports=require(58)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/node_modules/lodash._objectpool/index.js":58}],63:[function(require,module,exports){
function baseFlatten(e,r,t,a){for(var s=(a||0)-1,n=e?e.length:0,l=[];++s<n;){var i=e[s];if(i&&"object"==typeof i&&"number"==typeof i.length&&(isArray(i)||isArguments(i))){r||(i=baseFlatten(i,r,t));var o=-1,u=i.length,g=l.length;for(l.length+=u;++o<u;)l[g++]=i[o]}else t||l.push(i)}return l}var isArguments=require("lodash.isarguments"),isArray=require("lodash.isarray");module.exports=baseFlatten;
},{"lodash.isarguments":64,"lodash.isarray":94}],64:[function(require,module,exports){
function isArguments(t){return t&&"object"==typeof t&&"number"==typeof t.length&&toString.call(t)==argsClass||!1}var argsClass="[object Arguments]",objectProto=Object.prototype,toString=objectProto.toString;module.exports=isArguments;
},{}],65:[function(require,module,exports){
function forEach(e,r,a){var o=-1,f=e?e.length:0;if(r=r&&"undefined"==typeof a?r:baseCreateCallback(r,a,3),"number"==typeof f)for(;++o<f&&r(e[o],o,e)!==!1;);else forOwn(e,r);return e}var baseCreateCallback=require("lodash._basecreatecallback"),forOwn=require("lodash.forown");module.exports=forEach;
},{"lodash._basecreatecallback":66,"lodash.forown":88}],66:[function(require,module,exports){
module.exports=require(27)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":27,"lodash._setbinddata":67,"lodash.bind":70,"lodash.identity":85,"lodash.support":86}],67:[function(require,module,exports){
module.exports=require(28)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":28,"lodash._isnative":68,"lodash.noop":69}],68:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],69:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],70:[function(require,module,exports){
module.exports=require(31)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":31,"lodash._createwrapper":71,"lodash._slice":84}],71:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":32,"lodash._basebind":72,"lodash._basecreatewrapper":78,"lodash._slice":84,"lodash.isfunction":97}],72:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":33,"lodash._basecreate":73,"lodash._setbinddata":67,"lodash._slice":84,"lodash.isobject":76}],73:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":74,"lodash.isobject":76,"lodash.noop":75}],74:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],75:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],76:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":77}],77:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],78:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":39,"lodash._basecreate":79,"lodash._setbinddata":67,"lodash._slice":84,"lodash.isobject":82}],79:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":80,"lodash.isobject":82,"lodash.noop":81}],80:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],81:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],82:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":83}],83:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],84:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],85:[function(require,module,exports){
module.exports=require(46)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":46}],86:[function(require,module,exports){
module.exports=require(47)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":47,"lodash._isnative":87}],87:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],88:[function(require,module,exports){
module.exports=require(20)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.forown/index.js":20,"lodash._basecreatecallback":66,"lodash._objecttypes":89,"lodash.keys":90}],89:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],90:[function(require,module,exports){
module.exports=require(17)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":17,"lodash._isnative":91,"lodash._shimkeys":92,"lodash.isobject":93}],91:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],92:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":19,"lodash._objecttypes":89}],93:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":89}],94:[function(require,module,exports){
var isNative=require("lodash._isnative"),arrayClass="[object Array]",objectProto=Object.prototype,toString=objectProto.toString,nativeIsArray=isNative(nativeIsArray=Array.isArray)&&nativeIsArray,isArray=nativeIsArray||function(r){return r&&"object"==typeof r&&"number"==typeof r.length&&toString.call(r)==arrayClass||!1};module.exports=isArray;
},{"lodash._isnative":95}],95:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],96:[function(require,module,exports){
function isBoolean(o){return o===!0||o===!1||o&&"object"==typeof o&&toString.call(o)==boolClass||!1}var boolClass="[object Boolean]",objectProto=Object.prototype,toString=objectProto.toString;module.exports=isBoolean;
},{}],97:[function(require,module,exports){
function isFunction(n){return"function"==typeof n}module.exports=isFunction;
},{}],98:[function(require,module,exports){
function isNaN(r){return isNumber(r)&&r!=+r}var isNumber=require("lodash.isnumber");module.exports=isNaN;
},{"lodash.isnumber":100}],99:[function(require,module,exports){
function isNull(l){return null===l}module.exports=isNull;
},{}],100:[function(require,module,exports){
function isNumber(t){return"number"==typeof t||t&&"object"==typeof t&&toString.call(t)==numberClass||!1}var numberClass="[object Number]",objectProto=Object.prototype,toString=objectProto.toString;module.exports=isNumber;
},{}],101:[function(require,module,exports){
var isNative=require("lodash._isnative"),shimIsPlainObject=require("lodash._shimisplainobject"),objectClass="[object Object]",objectProto=Object.prototype,toString=objectProto.toString,getPrototypeOf=isNative(getPrototypeOf=Object.getPrototypeOf)&&getPrototypeOf,isPlainObject=getPrototypeOf?function(t){if(!t||toString.call(t)!=objectClass)return!1;var e=t.valueOf,o=isNative(e)&&(o=getPrototypeOf(e))&&getPrototypeOf(o);return o?t==o||getPrototypeOf(t)==o:shimIsPlainObject(t)}:shimIsPlainObject;module.exports=isPlainObject;
},{"lodash._isnative":102,"lodash._shimisplainobject":103}],102:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],103:[function(require,module,exports){
function shimIsPlainObject(o){var t,n;return o&&toString.call(o)==objectClass&&(t=o.constructor,!isFunction(t)||t instanceof t)?(forIn(o,function(o,t){n=t}),"undefined"==typeof n||hasOwnProperty.call(o,n)):!1}var forIn=require("lodash.forin"),isFunction=require("lodash.isfunction"),objectClass="[object Object]",objectProto=Object.prototype,toString=objectProto.toString,hasOwnProperty=objectProto.hasOwnProperty;module.exports=shimIsPlainObject;
},{"lodash.forin":104,"lodash.isfunction":97}],104:[function(require,module,exports){
var baseCreateCallback=require("lodash._basecreatecallback"),objectTypes=require("lodash._objecttypes"),forIn=function(e,r,a){var t,o=e,n=o;if(!o)return n;if(!objectTypes[typeof o])return n;r=r&&"undefined"==typeof a?r:baseCreateCallback(r,a,3);for(t in o)if(r(o[t],t,e)===!1)return n;return n};module.exports=forIn;
},{"lodash._basecreatecallback":105,"lodash._objecttypes":121}],105:[function(require,module,exports){
module.exports=require(27)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":27,"lodash._setbinddata":106,"lodash.bind":108,"lodash.identity":119,"lodash.support":120}],106:[function(require,module,exports){
module.exports=require(28)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":28,"lodash._isnative":102,"lodash.noop":107}],107:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],108:[function(require,module,exports){
module.exports=require(31)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":31,"lodash._createwrapper":109,"lodash._slice":118}],109:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":32,"lodash._basebind":110,"lodash._basecreatewrapper":114,"lodash._slice":118,"lodash.isfunction":97}],110:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":33,"lodash._basecreate":111,"lodash._setbinddata":106,"lodash._slice":118,"lodash.isobject":113}],111:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":102,"lodash.isobject":113,"lodash.noop":112}],112:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],113:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":121}],114:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":39,"lodash._basecreate":115,"lodash._setbinddata":106,"lodash._slice":118,"lodash.isobject":117}],115:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":102,"lodash.isobject":117,"lodash.noop":116}],116:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],117:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":121}],118:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],119:[function(require,module,exports){
module.exports=require(46)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":46}],120:[function(require,module,exports){
module.exports=require(47)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":47,"lodash._isnative":102}],121:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],122:[function(require,module,exports){
function isString(t){return"string"==typeof t||t&&"object"==typeof t&&toString.call(t)==stringClass||!1}var stringClass="[object String]",objectProto=Object.prototype,toString=objectProto.toString;module.exports=isString;
},{}],123:[function(require,module,exports){
function isUndefined(e){return"undefined"==typeof e}module.exports=isUndefined;
},{}],124:[function(require,module,exports){
function map(r,e,a){var o=-1,l=r?r.length:0;if(e=createCallback(e,a,3),"number"==typeof l)for(var n=Array(l);++o<l;)n[o]=e(r[o],o,r);else n=[],forOwn(r,function(r,a,l){n[++o]=e(r,a,l)});return n}var createCallback=require("lodash.createcallback"),forOwn=require("lodash.forown");module.exports=map;
},{"lodash.createcallback":125,"lodash.forown":159}],125:[function(require,module,exports){
function createCallback(e,r,a){var l=typeof e;if(null==e||"function"==l)return baseCreateCallback(e,r,a);if("object"!=l)return property(e);var t=keys(e),s=t[0],u=e[s];return 1!=t.length||u!==u||isObject(u)?function(r){for(var a=t.length,l=!1;a--&&(l=baseIsEqual(r[t[a]],e[t[a]],null,!0)););return l}:function(e){var r=e[s];return u===r&&(0!==u||1/u==1/r)}}var baseCreateCallback=require("lodash._basecreatecallback"),baseIsEqual=require("lodash._baseisequal"),isObject=require("lodash.isobject"),keys=require("lodash.keys"),property=require("lodash.property");module.exports=createCallback;
},{"lodash._basecreatecallback":126,"lodash._baseisequal":144,"lodash.isobject":152,"lodash.keys":154,"lodash.property":158}],126:[function(require,module,exports){
module.exports=require(27)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":27,"lodash._setbinddata":127,"lodash.bind":130,"lodash.identity":141,"lodash.support":142}],127:[function(require,module,exports){
module.exports=require(28)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":28,"lodash._isnative":128,"lodash.noop":129}],128:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],129:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],130:[function(require,module,exports){
module.exports=require(31)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":31,"lodash._createwrapper":131,"lodash._slice":140}],131:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":32,"lodash._basebind":132,"lodash._basecreatewrapper":136,"lodash._slice":140,"lodash.isfunction":97}],132:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":33,"lodash._basecreate":133,"lodash._setbinddata":127,"lodash._slice":140,"lodash.isobject":152}],133:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":134,"lodash.isobject":152,"lodash.noop":135}],134:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],135:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],136:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":39,"lodash._basecreate":137,"lodash._setbinddata":127,"lodash._slice":140,"lodash.isobject":152}],137:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":138,"lodash.isobject":152,"lodash.noop":139}],138:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],139:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],140:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],141:[function(require,module,exports){
module.exports=require(46)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":46}],142:[function(require,module,exports){
module.exports=require(47)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":47,"lodash._isnative":143}],143:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],144:[function(require,module,exports){
function baseIsEqual(r,e,a,s,t,o){if(a){var n=a(r,e);if("undefined"!=typeof n)return!!n}if(r===e)return 0!==r||1/r==1/e;var l=typeof r,c=typeof e;if(!(r!==r||r&&objectTypes[l]||e&&objectTypes[c]))return!1;if(null==r||null==e)return r===e;var i=toString.call(r),u=toString.call(e);if(i==argsClass&&(i=objectClass),u==argsClass&&(u=objectClass),i!=u)return!1;switch(i){case boolClass:case dateClass:return+r==+e;case numberClass:return r!=+r?e!=+e:0==r?1/r==1/e:r==+e;case regexpClass:case stringClass:return r==String(e)}var p=i==arrayClass;if(!p){var b=hasOwnProperty.call(r,"__wrapped__"),f=hasOwnProperty.call(e,"__wrapped__");if(b||f)return baseIsEqual(b?r.__wrapped__:r,f?e.__wrapped__:e,a,s,t,o);if(i!=objectClass)return!1;var y=r.constructor,g=e.constructor;if(y!=g&&!(isFunction(y)&&y instanceof y&&isFunction(g)&&g instanceof g)&&"constructor"in r&&"constructor"in e)return!1}var j=!t;t||(t=getArray()),o||(o=getArray());for(var C=t.length;C--;)if(t[C]==r)return o[C]==e;var _=0;if(n=!0,t.push(r),o.push(e),p){if(C=r.length,_=e.length,n=_==C,n||s)for(;_--;){var h=C,d=e[_];if(s)for(;h--&&!(n=baseIsEqual(r[h],d,a,s,t,o)););else if(!(n=baseIsEqual(r[_],d,a,s,t,o)))break}}else forIn(e,function(e,l,c){return hasOwnProperty.call(c,l)?(_++,n=hasOwnProperty.call(r,l)&&baseIsEqual(r[l],e,a,s,t,o)):void 0}),n&&!s&&forIn(r,function(r,e,a){return hasOwnProperty.call(a,e)?n=--_>-1:void 0});return t.pop(),o.pop(),j&&(releaseArray(t),releaseArray(o)),n}var forIn=require("lodash.forin"),getArray=require("lodash._getarray"),isFunction=require("lodash.isfunction"),objectTypes=require("lodash._objecttypes"),releaseArray=require("lodash._releasearray"),argsClass="[object Arguments]",arrayClass="[object Array]",boolClass="[object Boolean]",dateClass="[object Date]",numberClass="[object Number]",objectClass="[object Object]",regexpClass="[object RegExp]",stringClass="[object String]",objectProto=Object.prototype,toString=objectProto.toString,hasOwnProperty=objectProto.hasOwnProperty;module.exports=baseIsEqual;
},{"lodash._getarray":145,"lodash._objecttypes":147,"lodash._releasearray":148,"lodash.forin":151,"lodash.isfunction":97}],145:[function(require,module,exports){
module.exports=require(9)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/index.js":9,"lodash._arraypool":146}],146:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],147:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],148:[function(require,module,exports){
module.exports=require(11)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/index.js":11,"lodash._arraypool":149,"lodash._maxpoolsize":150}],149:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],150:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],151:[function(require,module,exports){
module.exports=require(104)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.isplainobject/node_modules/lodash._shimisplainobject/node_modules/lodash.forin/index.js":104,"lodash._basecreatecallback":126,"lodash._objecttypes":147}],152:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":153}],153:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],154:[function(require,module,exports){
module.exports=require(17)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":17,"lodash._isnative":155,"lodash._shimkeys":156,"lodash.isobject":152}],155:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],156:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":19,"lodash._objecttypes":157}],157:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],158:[function(require,module,exports){
function property(r){return function(t){return t[r]}}module.exports=property;
},{}],159:[function(require,module,exports){
module.exports=require(20)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.forown/index.js":20,"lodash._basecreatecallback":160,"lodash._objecttypes":180,"lodash.keys":181}],160:[function(require,module,exports){
module.exports=require(27)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":27,"lodash._setbinddata":161,"lodash.bind":164,"lodash.identity":177,"lodash.support":178}],161:[function(require,module,exports){
module.exports=require(28)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":28,"lodash._isnative":162,"lodash.noop":163}],162:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],163:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],164:[function(require,module,exports){
module.exports=require(31)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":31,"lodash._createwrapper":165,"lodash._slice":176}],165:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":32,"lodash._basebind":166,"lodash._basecreatewrapper":171,"lodash._slice":176,"lodash.isfunction":97}],166:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":33,"lodash._basecreate":167,"lodash._setbinddata":161,"lodash._slice":176,"lodash.isobject":170}],167:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":168,"lodash.isobject":170,"lodash.noop":169}],168:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],169:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],170:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":180}],171:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":39,"lodash._basecreate":172,"lodash._setbinddata":161,"lodash._slice":176,"lodash.isobject":175}],172:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":173,"lodash.isobject":175,"lodash.noop":174}],173:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],174:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],175:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":180}],176:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],177:[function(require,module,exports){
module.exports=require(46)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":46}],178:[function(require,module,exports){
module.exports=require(47)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":47,"lodash._isnative":179}],179:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],180:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],181:[function(require,module,exports){
module.exports=require(17)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":17,"lodash._isnative":182,"lodash._shimkeys":183,"lodash.isobject":184}],182:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],183:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":19,"lodash._objecttypes":180}],184:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":180}],185:[function(require,module,exports){
function reduce(e,r,a,n){if(!e)return a;var l=arguments.length<3;r=createCallback(r,n,4);var o=-1,t=e.length;if("number"==typeof t)for(l&&(a=e[++o]);++o<t;)a=r(a,e[o],o,e);else forOwn(e,function(e,n,o){a=l?(l=!1,e):r(a,e,n,o)});return a}var createCallback=require("lodash.createcallback"),forOwn=require("lodash.forown");module.exports=reduce;
},{"lodash.createcallback":186,"lodash.forown":220}],186:[function(require,module,exports){
module.exports=require(125)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/index.js":125,"lodash._basecreatecallback":187,"lodash._baseisequal":205,"lodash.isobject":213,"lodash.keys":215,"lodash.property":219}],187:[function(require,module,exports){
module.exports=require(27)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":27,"lodash._setbinddata":188,"lodash.bind":191,"lodash.identity":202,"lodash.support":203}],188:[function(require,module,exports){
module.exports=require(28)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":28,"lodash._isnative":189,"lodash.noop":190}],189:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],190:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],191:[function(require,module,exports){
module.exports=require(31)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":31,"lodash._createwrapper":192,"lodash._slice":201}],192:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":32,"lodash._basebind":193,"lodash._basecreatewrapper":197,"lodash._slice":201,"lodash.isfunction":97}],193:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":33,"lodash._basecreate":194,"lodash._setbinddata":188,"lodash._slice":201,"lodash.isobject":213}],194:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":195,"lodash.isobject":213,"lodash.noop":196}],195:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],196:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],197:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":39,"lodash._basecreate":198,"lodash._setbinddata":188,"lodash._slice":201,"lodash.isobject":213}],198:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":199,"lodash.isobject":213,"lodash.noop":200}],199:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],200:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],201:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],202:[function(require,module,exports){
module.exports=require(46)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":46}],203:[function(require,module,exports){
module.exports=require(47)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":47,"lodash._isnative":204}],204:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],205:[function(require,module,exports){
module.exports=require(144)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/node_modules/lodash._baseisequal/index.js":144,"lodash._getarray":206,"lodash._objecttypes":208,"lodash._releasearray":209,"lodash.forin":212,"lodash.isfunction":97}],206:[function(require,module,exports){
module.exports=require(9)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/index.js":9,"lodash._arraypool":207}],207:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],208:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],209:[function(require,module,exports){
module.exports=require(11)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/index.js":11,"lodash._arraypool":210,"lodash._maxpoolsize":211}],210:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],211:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],212:[function(require,module,exports){
module.exports=require(104)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.isplainobject/node_modules/lodash._shimisplainobject/node_modules/lodash.forin/index.js":104,"lodash._basecreatecallback":187,"lodash._objecttypes":208}],213:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":214}],214:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],215:[function(require,module,exports){
module.exports=require(17)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":17,"lodash._isnative":216,"lodash._shimkeys":217,"lodash.isobject":213}],216:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],217:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":19,"lodash._objecttypes":218}],218:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],219:[function(require,module,exports){
module.exports=require(158)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/node_modules/lodash.property/index.js":158}],220:[function(require,module,exports){
module.exports=require(20)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.forown/index.js":20,"lodash._basecreatecallback":221,"lodash._objecttypes":241,"lodash.keys":242}],221:[function(require,module,exports){
module.exports=require(27)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":27,"lodash._setbinddata":222,"lodash.bind":225,"lodash.identity":238,"lodash.support":239}],222:[function(require,module,exports){
module.exports=require(28)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":28,"lodash._isnative":223,"lodash.noop":224}],223:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],224:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],225:[function(require,module,exports){
module.exports=require(31)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":31,"lodash._createwrapper":226,"lodash._slice":237}],226:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":32,"lodash._basebind":227,"lodash._basecreatewrapper":232,"lodash._slice":237,"lodash.isfunction":97}],227:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":33,"lodash._basecreate":228,"lodash._setbinddata":222,"lodash._slice":237,"lodash.isobject":231}],228:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":229,"lodash.isobject":231,"lodash.noop":230}],229:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],230:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],231:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":241}],232:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":39,"lodash._basecreate":233,"lodash._setbinddata":222,"lodash._slice":237,"lodash.isobject":236}],233:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":234,"lodash.isobject":236,"lodash.noop":235}],234:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],235:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],236:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":241}],237:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],238:[function(require,module,exports){
module.exports=require(46)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":46}],239:[function(require,module,exports){
module.exports=require(47)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":47,"lodash._isnative":240}],240:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],241:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],242:[function(require,module,exports){
module.exports=require(17)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":17,"lodash._isnative":243,"lodash._shimkeys":244,"lodash.isobject":245}],243:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],244:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":19,"lodash._objecttypes":241}],245:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":241}],246:[function(require,module,exports){
function union(){return baseUniq(baseFlatten(arguments,!0,!0))}var baseFlatten=require("lodash._baseflatten"),baseUniq=require("lodash._baseuniq");module.exports=union;
},{"lodash._baseflatten":247,"lodash._baseuniq":249}],247:[function(require,module,exports){
module.exports=require(63)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._baseflatten/index.js":63,"lodash.isarguments":248,"lodash.isarray":94}],248:[function(require,module,exports){
module.exports=require(64)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._baseflatten/node_modules/lodash.isarguments/index.js":64}],249:[function(require,module,exports){
function baseUniq(e,r,a){var s=-1,l=baseIndexOf,c=e?e.length:0,h=[],i=!r&&c>=largeArraySize,d=a||i?getArray():h;if(i){var o=createCache(d);l=cacheIndexOf,d=o}for(;++s<c;){var t=e[s],n=a?a(t,s,e):t;(r?!s||d[d.length-1]!==n:l(d,n)<0)&&((a||i)&&d.push(n),h.push(t))}return i?(releaseArray(d.array),releaseObject(d)):a&&releaseArray(d),h}var baseIndexOf=require("lodash._baseindexof"),cacheIndexOf=require("lodash._cacheindexof"),createCache=require("lodash._createcache"),getArray=require("lodash._getarray"),largeArraySize=require("lodash._largearraysize"),releaseArray=require("lodash._releasearray"),releaseObject=require("lodash._releaseobject");module.exports=baseUniq;
},{"lodash._baseindexof":250,"lodash._cacheindexof":251,"lodash._createcache":253,"lodash._getarray":258,"lodash._largearraysize":260,"lodash._releasearray":261,"lodash._releaseobject":264}],250:[function(require,module,exports){
module.exports=require(51)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._baseindexof/index.js":51}],251:[function(require,module,exports){
module.exports=require(52)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/index.js":52,"lodash._baseindexof":250,"lodash._keyprefix":252}],252:[function(require,module,exports){
module.exports=require(53)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/node_modules/lodash._keyprefix/index.js":53}],253:[function(require,module,exports){
module.exports=require(54)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/index.js":54,"lodash._cachepush":254,"lodash._getobject":256,"lodash._releaseobject":264}],254:[function(require,module,exports){
module.exports=require(55)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._cachepush/index.js":55,"lodash._keyprefix":255}],255:[function(require,module,exports){
module.exports=require(53)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/node_modules/lodash._keyprefix/index.js":53}],256:[function(require,module,exports){
module.exports=require(57)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/index.js":57,"lodash._objectpool":257}],257:[function(require,module,exports){
module.exports=require(58)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/node_modules/lodash._objectpool/index.js":58}],258:[function(require,module,exports){
module.exports=require(9)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/index.js":9,"lodash._arraypool":259}],259:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],260:[function(require,module,exports){
module.exports=require(59)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._largearraysize/index.js":59}],261:[function(require,module,exports){
module.exports=require(11)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/index.js":11,"lodash._arraypool":262,"lodash._maxpoolsize":263}],262:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],263:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],264:[function(require,module,exports){
module.exports=require(60)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._releaseobject/index.js":60,"lodash._maxpoolsize":265,"lodash._objectpool":266}],265:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],266:[function(require,module,exports){
module.exports=require(58)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/node_modules/lodash._objectpool/index.js":58}],267:[function(require,module,exports){
function uniq(e,a,l,n){return"boolean"!=typeof a&&null!=a&&(n=l,l="function"!=typeof a&&n&&n[a]===e?null:a,a=!1),null!=l&&(l=createCallback(l,n,3)),baseUniq(e,a,l)}var baseUniq=require("lodash._baseuniq"),createCallback=require("lodash.createcallback");module.exports=uniq;
},{"lodash._baseuniq":268,"lodash.createcallback":286}],268:[function(require,module,exports){
module.exports=require(249)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.union/node_modules/lodash._baseuniq/index.js":249,"lodash._baseindexof":269,"lodash._cacheindexof":270,"lodash._createcache":272,"lodash._getarray":277,"lodash._largearraysize":279,"lodash._releasearray":280,"lodash._releaseobject":283}],269:[function(require,module,exports){
module.exports=require(51)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._baseindexof/index.js":51}],270:[function(require,module,exports){
module.exports=require(52)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/index.js":52,"lodash._baseindexof":269,"lodash._keyprefix":271}],271:[function(require,module,exports){
module.exports=require(53)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/node_modules/lodash._keyprefix/index.js":53}],272:[function(require,module,exports){
module.exports=require(54)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/index.js":54,"lodash._cachepush":273,"lodash._getobject":275,"lodash._releaseobject":283}],273:[function(require,module,exports){
module.exports=require(55)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._cachepush/index.js":55,"lodash._keyprefix":274}],274:[function(require,module,exports){
module.exports=require(53)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._cacheindexof/node_modules/lodash._keyprefix/index.js":53}],275:[function(require,module,exports){
module.exports=require(57)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/index.js":57,"lodash._objectpool":276}],276:[function(require,module,exports){
module.exports=require(58)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/node_modules/lodash._objectpool/index.js":58}],277:[function(require,module,exports){
module.exports=require(9)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/index.js":9,"lodash._arraypool":278}],278:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],279:[function(require,module,exports){
module.exports=require(59)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._largearraysize/index.js":59}],280:[function(require,module,exports){
module.exports=require(11)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/index.js":11,"lodash._arraypool":281,"lodash._maxpoolsize":282}],281:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],282:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],283:[function(require,module,exports){
module.exports=require(60)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._releaseobject/index.js":60,"lodash._maxpoolsize":284,"lodash._objectpool":285}],284:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],285:[function(require,module,exports){
module.exports=require(58)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.difference/node_modules/lodash._basedifference/node_modules/lodash._createcache/node_modules/lodash._getobject/node_modules/lodash._objectpool/index.js":58}],286:[function(require,module,exports){
module.exports=require(125)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/index.js":125,"lodash._basecreatecallback":287,"lodash._baseisequal":305,"lodash.isobject":313,"lodash.keys":315,"lodash.property":319}],287:[function(require,module,exports){
module.exports=require(27)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/index.js":27,"lodash._setbinddata":288,"lodash.bind":291,"lodash.identity":302,"lodash.support":303}],288:[function(require,module,exports){
module.exports=require(28)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/index.js":28,"lodash._isnative":289,"lodash.noop":290}],289:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],290:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],291:[function(require,module,exports){
module.exports=require(31)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/index.js":31,"lodash._createwrapper":292,"lodash._slice":301}],292:[function(require,module,exports){
module.exports=require(32)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/index.js":32,"lodash._basebind":293,"lodash._basecreatewrapper":297,"lodash._slice":301,"lodash.isfunction":97}],293:[function(require,module,exports){
module.exports=require(33)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/index.js":33,"lodash._basecreate":294,"lodash._setbinddata":288,"lodash._slice":301,"lodash.isobject":313}],294:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":295,"lodash.isobject":313,"lodash.noop":296}],295:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],296:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],297:[function(require,module,exports){
module.exports=require(39)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basecreatewrapper/index.js":39,"lodash._basecreate":298,"lodash._setbinddata":288,"lodash._slice":301,"lodash.isobject":313}],298:[function(require,module,exports){
module.exports=require(34)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.bind/node_modules/lodash._createwrapper/node_modules/lodash._basebind/node_modules/lodash._basecreate/index.js":34,"lodash._isnative":299,"lodash.isobject":313,"lodash.noop":300}],299:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],300:[function(require,module,exports){
module.exports=require(30)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash._setbinddata/node_modules/lodash.noop/index.js":30}],301:[function(require,module,exports){
module.exports=require(14)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._slice/index.js":14}],302:[function(require,module,exports){
module.exports=require(46)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.identity/index.js":46}],303:[function(require,module,exports){
module.exports=require(47)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._basecreatecallback/node_modules/lodash.support/index.js":47,"lodash._isnative":304}],304:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],305:[function(require,module,exports){
module.exports=require(144)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/node_modules/lodash._baseisequal/index.js":144,"lodash._getarray":306,"lodash._objecttypes":308,"lodash._releasearray":309,"lodash.forin":312,"lodash.isfunction":97}],306:[function(require,module,exports){
module.exports=require(9)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/index.js":9,"lodash._arraypool":307}],307:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],308:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],309:[function(require,module,exports){
module.exports=require(11)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/index.js":11,"lodash._arraypool":310,"lodash._maxpoolsize":311}],310:[function(require,module,exports){
module.exports=require(10)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._getarray/node_modules/lodash._arraypool/index.js":10}],311:[function(require,module,exports){
module.exports=require(13)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash._releasearray/node_modules/lodash._maxpoolsize/index.js":13}],312:[function(require,module,exports){
module.exports=require(104)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.isplainobject/node_modules/lodash._shimisplainobject/node_modules/lodash.forin/index.js":104,"lodash._basecreatecallback":287,"lodash._objecttypes":308}],313:[function(require,module,exports){
module.exports=require(25)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.isobject/index.js":25,"lodash._objecttypes":314}],314:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],315:[function(require,module,exports){
module.exports=require(17)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/index.js":17,"lodash._isnative":316,"lodash._shimkeys":317,"lodash.isobject":313}],316:[function(require,module,exports){
module.exports=require(18)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._isnative/index.js":18}],317:[function(require,module,exports){
module.exports=require(19)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash.keys/node_modules/lodash._shimkeys/index.js":19,"lodash._objecttypes":318}],318:[function(require,module,exports){
module.exports=require(16)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.clonedeep/node_modules/lodash._baseclone/node_modules/lodash.assign/node_modules/lodash._objecttypes/index.js":16}],319:[function(require,module,exports){
module.exports=require(158)
},{"/Users/jwhitlock/workspaces/personal/swagger-tools/node_modules/lodash.map/node_modules/lodash.createcallback/node_modules/lodash.property/index.js":158}],320:[function(require,module,exports){
!function(t){if("object"==typeof exports)module.exports=t();else if("function"==typeof define&&define.amd)define(t);else{var r;try{r=window}catch(e){r=self}r.SparkMD5=t()}}(function(){"use strict";var t=function(t,r){return t+r&4294967295},r=function(r,e,n,i,f,o){return e=t(t(e,r),t(i,o)),t(e<<f|e>>>32-f,n)},e=function(t,e,n,i,f,o,s){return r(e&n|~e&i,t,e,f,o,s)},n=function(t,e,n,i,f,o,s){return r(e&i|n&~i,t,e,f,o,s)},i=function(t,e,n,i,f,o,s){return r(e^n^i,t,e,f,o,s)},f=function(t,e,n,i,f,o,s){return r(n^(e|~i),t,e,f,o,s)},o=function(r,o){var s=r[0],u=r[1],a=r[2],h=r[3];s=e(s,u,a,h,o[0],7,-680876936),h=e(h,s,u,a,o[1],12,-389564586),a=e(a,h,s,u,o[2],17,606105819),u=e(u,a,h,s,o[3],22,-1044525330),s=e(s,u,a,h,o[4],7,-176418897),h=e(h,s,u,a,o[5],12,1200080426),a=e(a,h,s,u,o[6],17,-1473231341),u=e(u,a,h,s,o[7],22,-45705983),s=e(s,u,a,h,o[8],7,1770035416),h=e(h,s,u,a,o[9],12,-1958414417),a=e(a,h,s,u,o[10],17,-42063),u=e(u,a,h,s,o[11],22,-1990404162),s=e(s,u,a,h,o[12],7,1804603682),h=e(h,s,u,a,o[13],12,-40341101),a=e(a,h,s,u,o[14],17,-1502002290),u=e(u,a,h,s,o[15],22,1236535329),s=n(s,u,a,h,o[1],5,-165796510),h=n(h,s,u,a,o[6],9,-1069501632),a=n(a,h,s,u,o[11],14,643717713),u=n(u,a,h,s,o[0],20,-373897302),s=n(s,u,a,h,o[5],5,-701558691),h=n(h,s,u,a,o[10],9,38016083),a=n(a,h,s,u,o[15],14,-660478335),u=n(u,a,h,s,o[4],20,-405537848),s=n(s,u,a,h,o[9],5,568446438),h=n(h,s,u,a,o[14],9,-1019803690),a=n(a,h,s,u,o[3],14,-187363961),u=n(u,a,h,s,o[8],20,1163531501),s=n(s,u,a,h,o[13],5,-1444681467),h=n(h,s,u,a,o[2],9,-51403784),a=n(a,h,s,u,o[7],14,1735328473),u=n(u,a,h,s,o[12],20,-1926607734),s=i(s,u,a,h,o[5],4,-378558),h=i(h,s,u,a,o[8],11,-2022574463),a=i(a,h,s,u,o[11],16,1839030562),u=i(u,a,h,s,o[14],23,-35309556),s=i(s,u,a,h,o[1],4,-1530992060),h=i(h,s,u,a,o[4],11,1272893353),a=i(a,h,s,u,o[7],16,-155497632),u=i(u,a,h,s,o[10],23,-1094730640),s=i(s,u,a,h,o[13],4,681279174),h=i(h,s,u,a,o[0],11,-358537222),a=i(a,h,s,u,o[3],16,-722521979),u=i(u,a,h,s,o[6],23,76029189),s=i(s,u,a,h,o[9],4,-640364487),h=i(h,s,u,a,o[12],11,-421815835),a=i(a,h,s,u,o[15],16,530742520),u=i(u,a,h,s,o[2],23,-995338651),s=f(s,u,a,h,o[0],6,-198630844),h=f(h,s,u,a,o[7],10,1126891415),a=f(a,h,s,u,o[14],15,-1416354905),u=f(u,a,h,s,o[5],21,-57434055),s=f(s,u,a,h,o[12],6,1700485571),h=f(h,s,u,a,o[3],10,-1894986606),a=f(a,h,s,u,o[10],15,-1051523),u=f(u,a,h,s,o[1],21,-2054922799),s=f(s,u,a,h,o[8],6,1873313359),h=f(h,s,u,a,o[15],10,-30611744),a=f(a,h,s,u,o[6],15,-1560198380),u=f(u,a,h,s,o[13],21,1309151649),s=f(s,u,a,h,o[4],6,-145523070),h=f(h,s,u,a,o[11],10,-1120210379),a=f(a,h,s,u,o[2],15,718787259),u=f(u,a,h,s,o[9],21,-343485551),r[0]=t(s,r[0]),r[1]=t(u,r[1]),r[2]=t(a,r[2]),r[3]=t(h,r[3])},s=function(t){var r,e=[];for(r=0;64>r;r+=4)e[r>>2]=t.charCodeAt(r)+(t.charCodeAt(r+1)<<8)+(t.charCodeAt(r+2)<<16)+(t.charCodeAt(r+3)<<24);return e},u=function(t){var r,e=[];for(r=0;64>r;r+=4)e[r>>2]=t[r]+(t[r+1]<<8)+(t[r+2]<<16)+(t[r+3]<<24);return e},a=function(t){var r,e,n,i,f,u,a=t.length,h=[1732584193,-271733879,-1732584194,271733878];for(r=64;a>=r;r+=64)o(h,s(t.substring(r-64,r)));for(t=t.substring(r-64),e=t.length,n=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],r=0;e>r;r+=1)n[r>>2]|=t.charCodeAt(r)<<(r%4<<3);if(n[r>>2]|=128<<(r%4<<3),r>55)for(o(h,n),r=0;16>r;r+=1)n[r]=0;return i=8*a,i=i.toString(16).match(/(.*?)(.{0,8})$/),f=parseInt(i[2],16),u=parseInt(i[1],16)||0,n[14]=f,n[15]=u,o(h,n),h},h=function(t){var r,e,n,i,f,s,a=t.length,h=[1732584193,-271733879,-1732584194,271733878];for(r=64;a>=r;r+=64)o(h,u(t.subarray(r-64,r)));for(t=a>r-64?t.subarray(r-64):new Uint8Array(0),e=t.length,n=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],r=0;e>r;r+=1)n[r>>2]|=t[r]<<(r%4<<3);if(n[r>>2]|=128<<(r%4<<3),r>55)for(o(h,n),r=0;16>r;r+=1)n[r]=0;return i=8*a,i=i.toString(16).match(/(.*?)(.{0,8})$/),f=parseInt(i[2],16),s=parseInt(i[1],16)||0,n[14]=f,n[15]=s,o(h,n),h},c=["0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"],p=function(t){var r,e="";for(r=0;4>r;r+=1)e+=c[t>>8*r+4&15]+c[t>>8*r&15];return e},y=function(t){var r;for(r=0;r<t.length;r+=1)t[r]=p(t[r]);return t.join("")},_=function(t){return y(a(t))},d=function(){this.reset()};return"5d41402abc4b2a76b9719d911017c592"!==_("hello")&&(t=function(t,r){var e=(65535&t)+(65535&r),n=(t>>16)+(r>>16)+(e>>16);return n<<16|65535&e}),d.prototype.append=function(t){return/[\u0080-\uFFFF]/.test(t)&&(t=unescape(encodeURIComponent(t))),this.appendBinary(t),this},d.prototype.appendBinary=function(t){this._buff+=t,this._length+=t.length;var r,e=this._buff.length;for(r=64;e>=r;r+=64)o(this._state,s(this._buff.substring(r-64,r)));return this._buff=this._buff.substr(r-64),this},d.prototype.end=function(t){var r,e,n=this._buff,i=n.length,f=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(r=0;i>r;r+=1)f[r>>2]|=n.charCodeAt(r)<<(r%4<<3);return this._finish(f,i),e=t?this._state:y(this._state),this.reset(),e},d.prototype._finish=function(t,r){var e,n,i,f=r;if(t[f>>2]|=128<<(f%4<<3),f>55)for(o(this._state,t),f=0;16>f;f+=1)t[f]=0;e=8*this._length,e=e.toString(16).match(/(.*?)(.{0,8})$/),n=parseInt(e[2],16),i=parseInt(e[1],16)||0,t[14]=n,t[15]=i,o(this._state,t)},d.prototype.reset=function(){return this._buff="",this._length=0,this._state=[1732584193,-271733879,-1732584194,271733878],this},d.prototype.destroy=function(){delete this._state,delete this._buff,delete this._length},d.hash=function(t,r){/[\u0080-\uFFFF]/.test(t)&&(t=unescape(encodeURIComponent(t)));var e=a(t);return r?e:y(e)},d.hashBinary=function(t,r){var e=a(t);return r?e:y(e)},d.ArrayBuffer=function(){this.reset()},d.ArrayBuffer.prototype.append=function(t){var r,e=this._concatArrayBuffer(this._buff,t),n=e.length;for(this._length+=t.byteLength,r=64;n>=r;r+=64)o(this._state,u(e.subarray(r-64,r)));return this._buff=n>r-64?e.subarray(r-64):new Uint8Array(0),this},d.ArrayBuffer.prototype.end=function(t){var r,e,n=this._buff,i=n.length,f=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(r=0;i>r;r+=1)f[r>>2]|=n[r]<<(r%4<<3);return this._finish(f,i),e=t?this._state:y(this._state),this.reset(),e},d.ArrayBuffer.prototype._finish=d.prototype._finish,d.ArrayBuffer.prototype.reset=function(){return this._buff=new Uint8Array(0),this._length=0,this._state=[1732584193,-271733879,-1732584194,271733878],this},d.ArrayBuffer.prototype.destroy=d.prototype.destroy,d.ArrayBuffer.prototype._concatArrayBuffer=function(t,r){var e=t.length,n=new Uint8Array(e+r.byteLength);return n.set(t),n.set(new Uint8Array(r),e),n},d.ArrayBuffer.hash=function(t,r){var e=h(new Uint8Array(t));return r?e:y(e)},d});
},{}],321:[function(require,module,exports){
function Traverse(e){this.value=e}function walk(e,t,r){var o=[],n=[],a=!0;return function i(e){function c(){if("object"==typeof l.node&&null!==l.node){l.keys&&l.node_===l.node||(l.keys=objectKeys(l.node)),l.isLeaf=0==l.keys.length;for(var t=0;t<n.length;t++)if(n[t].node_===e){l.circular=n[t];break}}else l.isLeaf=!0,l.keys=null;l.notLeaf=!l.isLeaf,l.notRoot=!l.isRoot}var s=r?copy(e):e,u={},f=!0,l={node:s,node_:e,path:[].concat(o),parent:n[n.length-1],parents:n,key:o.slice(-1)[0],isRoot:0===o.length,level:o.length,circular:null,update:function(e,t){l.isRoot||(l.parent.node[l.key]=e),l.node=e,t&&(f=!1)},"delete":function(e){delete l.parent.node[l.key],e&&(f=!1)},remove:function(e){isArray(l.parent.node)?l.parent.node.splice(l.key,1):delete l.parent.node[l.key],e&&(f=!1)},keys:null,before:function(e){u.before=e},after:function(e){u.after=e},pre:function(e){u.pre=e},post:function(e){u.post=e},stop:function(){a=!1},block:function(){f=!1}};if(!a)return l;c();var p=t.call(l,l.node);return void 0!==p&&l.update&&l.update(p),u.before&&u.before.call(l,l.node),f?("object"!=typeof l.node||null===l.node||l.circular||(n.push(l),c(),forEach(l.keys,function(e,t){o.push(e),u.pre&&u.pre.call(l,l.node[e],e);var n=i(l.node[e]);r&&hasOwnProperty.call(l.node,e)&&(l.node[e]=n.node),n.isLast=t==l.keys.length-1,n.isFirst=0==t,u.post&&u.post.call(l,n),o.pop()}),n.pop()),u.after&&u.after.call(l,l.node),l):l}(e).node}function copy(e){if("object"==typeof e&&null!==e){var t;if(isArray(e))t=[];else if(isDate(e))t=new Date(e.getTime?e.getTime():e);else if(isRegExp(e))t=new RegExp(e);else if(isError(e))t={message:e.message};else if(isBoolean(e))t=new Boolean(e);else if(isNumber(e))t=new Number(e);else if(isString(e))t=new String(e);else if(Object.create&&Object.getPrototypeOf)t=Object.create(Object.getPrototypeOf(e));else if(e.constructor===Object)t={};else{var r=e.constructor&&e.constructor.prototype||e.__proto__||{},o=function(){};o.prototype=r,t=new o}return forEach(objectKeys(e),function(r){t[r]=e[r]}),t}return e}function toS(e){return Object.prototype.toString.call(e)}function isDate(e){return"[object Date]"===toS(e)}function isRegExp(e){return"[object RegExp]"===toS(e)}function isError(e){return"[object Error]"===toS(e)}function isBoolean(e){return"[object Boolean]"===toS(e)}function isNumber(e){return"[object Number]"===toS(e)}function isString(e){return"[object String]"===toS(e)}var traverse=module.exports=function(e){return new Traverse(e)};Traverse.prototype.get=function(e){for(var t=this.value,r=0;r<e.length;r++){var o=e[r];if(!t||!hasOwnProperty.call(t,o)){t=void 0;break}t=t[o]}return t},Traverse.prototype.has=function(e){for(var t=this.value,r=0;r<e.length;r++){var o=e[r];if(!t||!hasOwnProperty.call(t,o))return!1;t=t[o]}return!0},Traverse.prototype.set=function(e,t){for(var r=this.value,o=0;o<e.length-1;o++){var n=e[o];hasOwnProperty.call(r,n)||(r[n]={}),r=r[n]}return r[e[o]]=t,t},Traverse.prototype.map=function(e){return walk(this.value,e,!0)},Traverse.prototype.forEach=function(e){return this.value=walk(this.value,e,!1),this.value},Traverse.prototype.reduce=function(e,t){var r=1===arguments.length,o=r?this.value:t;return this.forEach(function(t){this.isRoot&&r||(o=e.call(this,o,t))}),o},Traverse.prototype.paths=function(){var e=[];return this.forEach(function(){e.push(this.path)}),e},Traverse.prototype.nodes=function(){var e=[];return this.forEach(function(){e.push(this.node)}),e},Traverse.prototype.clone=function(){var e=[],t=[];return function r(o){for(var n=0;n<e.length;n++)if(e[n]===o)return t[n];if("object"==typeof o&&null!==o){var a=copy(o);return e.push(o),t.push(a),forEach(objectKeys(o),function(e){a[e]=r(o[e])}),e.pop(),t.pop(),a}return o}(this.value)};var objectKeys=Object.keys||function(e){var t=[];for(var r in e)t.push(r);return t},isArray=Array.isArray||function(e){return"[object Array]"===Object.prototype.toString.call(e)},forEach=function(e,t){if(e.forEach)return e.forEach(t);for(var r=0;r<e.length;r++)t(e[r],r,e)};forEach(objectKeys(Traverse.prototype),function(e){traverse[e]=function(t){var r=[].slice.call(arguments,1),o=new Traverse(t);return o[e].apply(o,r)}});var hasOwnProperty=Object.hasOwnProperty||function(e,t){return t in e};
},{}],322:[function(require,module,exports){
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

},{}],323:[function(require,module,exports){
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


},{}],324:[function(require,module,exports){
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
},{}],325:[function(require,module,exports){
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

},{}],326:[function(require,module,exports){
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
},{}],327:[function(require,module,exports){
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


},{}],328:[function(require,module,exports){
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
},{}],329:[function(require,module,exports){
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

},{}],330:[function(require,module,exports){
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

},{}],331:[function(require,module,exports){
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

},{}],332:[function(require,module,exports){
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
},{}],333:[function(require,module,exports){
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

},{}],334:[function(require,module,exports){
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