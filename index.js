var deepEqual = require('deep-equal');
var expect = require("expect.js");
var util = require('util');
var urlgrey = require('urlgrey');
var request = require('request');
var superagent = require('superagent');
var Reaper = require('reaper');
var difflet = require('difflet');
var diff = difflet({indent:2}).compare;
var assert = require('assert');
var _ = require('underscore');
var requestify = require('requestify');

var isString = function(str){
  return toString.call(str) == '[object String]';
};

var isFunction = function(functionToCheck) {
 var getType = {};
 return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
};

// checks a response holistically, rather than in parts,
// which results in better error output.
var Verity = function(uri, _method){
  if (!(this instanceof Verity)) {
    return new Verity(uri, _method);
  }
  this.uri = urlgrey(uri || 'http://localhost:80');
  this._method = _method || 'GET';
  this._body = '';
  this.bodyChecks = [];
  this.cookieJar = request.jar();
  this.client = request.defaults({
    timeout:3000,
    jar: this.cookieJar
  });
  this.headers = {};
  this.cookies = {};
  this.shouldLog = true;
  this.expectedBody = null;
  this._expectedStatus = 200;
  this._expectedCookies = {};
  this._expectedHeaders = {};
  this._expectedBodyTesters = [];
  this._expected = null;
  this.response = {};
  this.jsonModeOn = false;
  this.message = '';
};


Verity.prototype.body = function(body){
  this._body = body;
  return this;
};

Verity.prototype.method = function(method){
  this._method = method;
  return this;
};

Verity.prototype.expectStatus = function (code) {
  this._expectedStatus = code;
  return this;
};


Verity.prototype.request = function(options, cb){
  options = options || {};
  var that = this;
  var method = options.method || this._method;
  var url = options.url || this.uri.toString();
  var body = options.body || this._body;
  var headers = options.headers || this.headers;
  this.client(options, function(err, response, body){
    if (err){
      return cb(err);
    }
    var cookies = response.headers['set-cookie'] || [];
    var expected = cookies.length;
    if (expected === 0){
      return cb(err, response, body);
    }
    var doneSetting = function(err){
     expected -= 1;
     if (expected === 0){
       return cb(err, response, body);
     }
    };
    cookies.forEach(function(cookie){
      that.setCookieFromString(cookie, doneSetting);
    });
  });
};

var getCookiesFromResponse = function(res){
  var cookies = {};
  if (res.headers['set-cookie']){
    res.headers['set-cookie'].forEach(function(cookie){
      cookie = cookieStringToObject(cookie);
      if (cookie.value === ''){
        delete cookies[cookie.name];
      } else {
        cookies[cookie.name] = cookie;
      }
    });
  }
  return cookies;
};

var cookieObjectToString = function(obj){
  var pairs = [obj.name + '=' + obj.value];
  for(var k in obj){
    if (k !== 'name' && k !== 'value'){
      pairs.push(k + '=' + obj[k]);
    }
  }
  var str = pairs.join('; ');
  return str;
};

var cookieStringToObject = function(str){
  var obj = {};
  var pairs = str.toString().split(";");
  pairs.forEach(function(pair){
    var pieces = pair.trim().split('=');
    pieces = pieces.map(function(str){
      return str.trim();
    });
    var key = [
      "Domain", "Path", "Expires", "Secure"
    ];
    if (key.indexOf(pieces[0]) === -1){
      obj.name = pieces[0];
      obj.value = pieces[1];
    } else {
      obj[pieces[0]] = pieces[1];
      if (pieces[0] == "Secure"){
        obj[pieces[0]] = true;
      }
    }
  });
  return obj;
};

Verity.prototype.expectHeader = function(name, value){
  this._expectedHeaders[name] = value;
  return this;
};
Verity.prototype.authStrategy = function(creds, cb){
  // replace this with a function that logs the user in
  return cb(null);
};
Verity.prototype.login = function(creds){
  this.creds = creds;
  this._mustlogin = true;
  return this;
};


Verity.prototype.setCookieFromString = function(str, cb){
  var that = this;
  var cookie = request.cookie(str);
  this.cookieJar.setCookie(cookie, '/', {}, function(err){
    that.cookieJar.getCookies('/', {}, function(err, cookies){
      cb(err);
    });
  
  });
  /*
  console.log("cookie set from: ", str);
  this.cookieJar.setCookie(str, '/', {}, function(err){
    console.log("set err: ", err);
    that.cookieJar.getCookies('/', {}, function(err, cookies){
      console.log("err: ", err);
      console.log("cookies: ", cookies);
      cb(err);
    });
  });
  */
};

Verity.prototype.expectCookie = function(name, value){
  this._expectedCookies[name] = value;
  return this;
};

Verity.prototype.setAuthStrategy = function(strategy){
  this.authStrategy = strategy;
  return this;
};

Verity.prototype.test = function(cb){
  this.message = '';
  var options = { headers : this.headers };
  options.method = this._method.toLowerCase();
  options.url = this.uri.toString();
  if (!!this._body){
    if (this.jsonModeOn){
      if (options.method !== 'GET'){
        options.headers['content-type'] = 'application/json';
        if (!isString(this._body)){
          options.body = JSON.stringify(this._body);
        }
      }
    } else {
      options.body = this._body;
    }
  }
  var that = this;
  if (this.creds && this._mustlogin){
    if (!this.authStrategy){
      throw "can't login with no auth strategy";
    }
    this.authStrategy(this.creds, function(){
      makeRequest(that, options, cb);
    });
  } else {
    makeRequest(that, options, cb);
  }
};

// TODO make sure this gets called
Verity.prototype.reset = function(){
  this.bodyChecks = [];
  this._body = '';
  this.headers = {};
  this._expectedCookies = {};
  this._expectedHeaders = {};
  this._expectedStatus = 200;
  this._expectedBodyTesters = [];
};

var makeRequest = function(that, options, cb){
  if (that.debugMode){
    console.log("REQUEST: ");
    console.log(options);
  }
  // options will have : headers, method, url, body
  that.creds = null;  // forget that we know how to log in
  /*
  var j = request.jar();
  for (var k in that.cookies){
    var obj = that.cookies[k];
    var cookiestr = cookieObjectToString(obj);
    var cookie = that.client.cookie(cookiestr);
    j.add(cookie);
  }
  options.jar = j;
  */
  that.response = {};
  that.client(options, function(err, response, body){
    if (err) {
      return cb(err);
    }
    that.response = response;
    that.cookies = _.extend(that.cookies, getCookiesFromResponse(response));
    var result = {
      status : {},
      headers : {},
      body : {}
    };
    if (that.jsonModeOn){
      try {
        body = JSON.parse(body);
      } catch(ex){
        // do nothing if it doesn't parse.
        // it will stay as a string
      }
    }
    
    var failed = false;
    var shortMessage = '';


    // statusCode stuff
    result.status.actual = response.statusCode;
    result.status.expected = that._expectedStatus;
    if (response.statusCode != that._expectedStatus){
      shortMessage = "status: (actual) " + response.statusCode + ' != (expected) ' + that._expectedStatus;
      failed = true;
    }

    // header stuff
    var headerErrors = [];
    for(var k in that._expectedHeaders){
      var v = that._expectedHeaders[k];
      if (k == 'content-type'){
        var reaper = new Reaper();
        reaper.register(v);
        expect(reaper.isAcceptable('application/json')).to.equal(true);
      } else {
        try {
          expect(response.headers[k]).to.equal(v);
        } catch (ex){
          if (!shortMessage){
            shortMessage = "headers didn't match expectations.";
          }
          headerErrors.push(ex);
        }
      }
    }
    result.headers.actual = response.headers;
    result.headers.expected = that._expectedHeaders;
    if (headerErrors.length > 0){
      result.headers.errors = headerErrors;
    }

    // cookie stuff
    var cookieErrors = [];
    for(var cookieKey in that._expectedCookies){
      var cookieVal = that._expectedCookies[cookieKey];
      var errObj = {key : cookieKey};
      if (!that.cookies[cookieKey]){
        errObj.message = "expected but missing";
        cookieErrors.push(errObj);
        failed = true;
      } else {
        try {
          expect(that.cookies[cookieKey].value).to.equal(cookieVal);
        } catch(ex){
          if (!shortMessage){
            shortMessage = "cookies didn't match expectations.";
          }
          errObj.message = ex.message;
          errObj.detail = ex;
          cookieErrors.push(errObj);
          failed = true;
        }
      }
    }
    if (_.keys(that._expectedCookies).length !== 0){
      result.cookies = {};
      result.cookies.actual = that.cookies;
      result.cookies.expected = that._expectedCookies;
      result.cookies.errors = cookieErrors;
    }

    // body stuff
    result.body.actual = body;
    result.body.errors = [];
    result.body.errors = getBodyErrors(that, body);
    if (result.body.errors.length > 0){
      if (!shortMessage){
        shortMessage = "body didn't match expectations.";
      }
      failed = true;
    }

    if (failed && that.shouldLog){
      prettyDiff(result);
    }
    if (failed){
      if (!that.shouldLog){
        console.log("should log was falsey");
      }
      return cb(new Error('Expectations failed: ' + shortMessage), result);
    }
    that.reset();
    return cb(null, result);
  });

};

var getBodyErrors = function(v, body){
  var errors = [];
  var testBody = body;
  v.bodyChecks.forEach(function(check){
    try {
      check.fnTest(testBody);
    } catch (ex){
      errors.push(ex);
    }
  });
  return errors;
};

Verity.prototype.checkBody = function(description, fnTest){
  // each call adds an assertion to the body assertions
  // fnTest should throw an assert error
  // optionalJsonPath is optional
  if (!fnTest){
    fnTest = description;
    description = '';
  }
  if (!isFunction(fnTest)){
    this.bodyChecks = [];
    var expected = fnTest;
    fnTest = function(body){
      assertObjectEquals(body, expected);
    };
  }
  this.bodyChecks.push({ message : description,
                         fnTest : fnTest });
  return this;
};

Verity.prototype.expectBody = function(body){
  return this.checkBody(body);
};

// format the diff better
var prettyDiff = function (result){
  if (result.body.errors && result.body.errors.length > 0){
    console.log("\nBODY ERRORS: ");
    result.body.errors.forEach(function(error){
      console.log(prettyJson({actual : error.actual, expected : error.expected}));
      console.log(error.colorDiff);
    });
  } else {
    console.log('BODY: \n', prettyJson(result.body));
  }
  console.log('HEADERS: \n', prettyJson(result.headers));
  console.log('STATUS: \n', prettyJson(result.status));
};

Verity.prototype.jsonMode = function(modeOn){
  if (modeOn !== false){
    this.jsonModeOn = true;
    this.expectHeader('content-type', 'application/json');
  } else {
    this.jsonModeOn = false;
  }
  return this;
};

Verity.prototype.log = function(shouldLog){
  if (shouldLog !== false){
    this.shouldLog = true;
  } else {
    this.shouldLog = false;
  }
  return this;
};

Verity.prototype.debug = function(shouldLog){
  if (shouldLog !== false){
    this.debugMode = true;
  } else {
    this.debugMode = false;
  }
  return this;
};

// TODO fix the eventemitter issue
// TODO possible libs :
//  - create a jsonschema from code
//
// goals : 
// - be good at reporting the whole diff at once (not just the first one found)
// - make repeated requests easy (with cookies)
// - 
// test:
// chaining with cookies

var assertObjectEquals = function (actual, expected){
  if (!deepEqual(actual, expected)){
    var err = new Error("ObjectEqualityAssertionError");
    err.actual = actual;
    err.expected = expected;
    err.colorDiff = difflet.compare(actual, expected);
    throw err;
  }
};
  
var prettyJson = function(obj){
  return JSON.stringify(obj, null, 2);
};

Verity.assertObjectEquals = assertObjectEquals;
Verity.prototype.assertObjectEquals = assertObjectEquals;

module.exports = Verity;
