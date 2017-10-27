var deepEqual = require('deep-equal');
var expect = require("expect.js");
var util = require('./util');
var urlgrey = require('urlgrey');
var request = require('request');
var superagent = require('superagent');
var Reaper = require('reaper');
var difflet = require('difflet');
var diff = difflet({indent:2, comment: true}).compare;
var assert = require('assert');
var _ = require('underscore');
var requestify = require('requestify');
var parseCookie = require("tough-cookie").Cookie.parse;

var deepequal = require("deep-equal");
var deepmerge = require("deepmerge");

var isSubset = util.isSubset;
var assertObjectEquals = util.assertObjectEquals;


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
  this.cookieJar = request.jar();
  this.client = request.defaults({
    timeout:3000,
    jar: this.cookieJar
  });
  this.headers = {};
  this.cookies = {};
  this.shouldLog = true;
  this.expectedBody = null;
  this.jsonModeOn = false;

  this._expectedHeaders = {};
  this._expectedCookies = {};
  this._expectations = {};

  this._unnamedExpectationCount = 0;
};

/*
  Setup methods - called before the request.
*/

// TODO make sure this gets called
Verity.prototype.reset = function(){
  this._body = '';
  this.headers = {};
  this._expectedHeaders = {};
  this._expectedCookies = {};
  this._expectations = {};
};

Verity.prototype.body = function(body){
  this._body = body;
  return this;
};

Verity.prototype.method = function(method){
  this._method = method;
  return this;
};

Verity.prototype.header = function(name, value){
  if (value === null){
    delete this.headers[name];
  } else {
    this.headers[name] = value;
  }
  return this;
};

Verity.prototype.path = function() {
  this.uri = this.uri.path.apply(this.uri, arguments);
  return this;
};

Verity.prototype.query = function(obj){
  this.uri = this.uri.query(obj);
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

Verity.prototype.logout = function(){
  this.creds = null;
  this._mustlogin = false;
  return this;
};

Verity.prototype.followRedirect = function(val) {
  if (val === false) {
    this._followRedirect = false;
  } else {
    this._followRedirect = true;
  }
  return this;
};

Verity.prototype.setAuthStrategy = function(strategy){
  this.authStrategy = strategy;
  return this;
};


Verity.prototype.setCookieFromString = function(str, cb){
  var that = this;
  var cookie = parseCookie(str).toString();
  this.cookieJar.setCookie(cookie, '/', {}, function(err){
    that.cookieJar.getCookies('/', {}, function(err, cookies){
      cb(err);
    });

  });
};

Verity.prototype.jsonMode = function(modeOn){
  if (modeOn !== false){
    this.jsonModeOn = true;
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

Verity.prototype.debug = Verity.prototype.log;

/*
  Execution methods - to make our request.
*/

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

Verity.prototype.test = function(cb) {
  // if no callback is passed, we'll return a promise
  var promise, resolve, reject;
  if (!cb) {
    promise = new Promise(function(_resolve, _reject) {
      resolve = _resolve;
      reject = _reject;
    });
    cb = function (err, response) {
      if (err) return reject(err);
      resolve(response);
    };
  }

  var that = this;

  // Request options.
  var options = {
    headers: this.headers,
    method: this._method.toLowerCase(),
    url: this.uri.toString(),
    followRedirect: !!this._followRedirect,
  };
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

  var login = function(login_cb) {
    if (that.creds && that._mustlogin){
      if (!that.authStrategy){
        throw "can't login with no auth strategy";
      }
      that.authStrategy(that.creds, function(){
        login_cb();
      });
    } else {
      login_cb();
    }
  };

  login(function() {
    that.client(options, function(err, res) {
      if (err) {
        return cb(err);
      }

      // Parse body.
      if (that.jsonModeOn){
        try {
          res.body = JSON.parse(res.body);
        } catch(ex){
          // do nothing if it doesn't parse.
          // it will stay as a string
        }
      }

      // Determine which tests failed.
      var unnamedExpectationCount = 1;
      var errors = {};
      Object.keys(that._expectations).forEach(function(name){
        try {
          that._expectations[name].bind(that)(res);
        } catch (err) {
          err.error = err.message; // err.message won't log with JSON.stringify
          errors[name] = err;
        }
      });

      // Reset test vars.
      that._expectations = {};
      that.creds = null;

      // Generate our result and log.
      var result = {
        errors: errors,
        status: res.statusCode,
        headers: res.headers,
        cookies: that.cookies,
        body: res.body
      };

      if (!_.isEmpty(errors)) {
        return cb(makeCombinedError(errors), result);
      } else {
        return cb(null, result);
      }
    });
  });

  return promise; // will be undefined if callback was passed
};

function makeCombinedError(errors) {
  var msg = [];
  var lastError;
  for (var name in errors) {
    msg.push(formatHeader(name));
    msg.push(errors[name].message);
    msg.push(errors[name].stack);
    lastError = errors[name];
  }

  if (msg.length === 3) throw lastError;

  return new Error("Expectations failed:\n\u001b[0m" + msg.join("\n"));
}

/*
  Expectation methods - test what was returned.
*/

Verity.register = function(key, fnTest) {
  if (!key || !fnTest) {
    throw new Error("Expect method must have a name and a function");
  }
  if (Verity.prototype[key]) {
    throw new Error("Verity already has a method named " + key);
  }
  var name = key[0].toUpperCase() + key.slice(1);
  Verity.prototype[key] = function() {
    this.expect(name, fnTest.apply(this, arguments));
    return this;
  };
};

Verity.prototype.expect = function(name, fnTest) {
  if (!fnTest) {
    fnTest = name;
    name = "Expectation " + this._unnamedExpectationCount++;
  }
  this._expectations[name] = fnTest;
  return this;
};

Verity.prototype.expectStatus = function(expected) {
  this.expect("Status", function(res) {
    var actual = res.statusCode;
    if (actual !== expected) {
      var err = new Error(["Expected status", expected, "but got", actual].join(" "));
      err.actual = actual;
      err.expected = expected;
      throw err;
    }
  });
  return this;
};

Verity.prototype.expectCookies = function(expectedCookies) {
  _.extend(this._expectedCookies, expectedCookies);
  this.expect("Cookies", function(res) {
    this.cookies = _.extend(this.cookies, getCookiesFromResponse(res));
    var badCookies = [];

    for (var name in this._expectedCookies) {
      var expected = this._expectedCookies[name];
      var actual = this.cookies[name];
      if (actual.value !== expected) {
        badCookies.push(name);
      }
    }
    if (badCookies.length) {
      var err = new Error("Error in cookies: " + badCookies.join(", "));
      err.actual = this.cookies;
      err.expected = this._expectedCookies;
      throw err;
    }
  });
  return this;
};

Verity.prototype.clearExpectedCookies = function() {
  this._expectedCookies = {};
};

Verity.prototype.expectHeaders = function(expectedHeaders) {
  _.extend(this._expectedHeaders, expectedHeaders);
  this.expect("Headers", function(res) {
    var badHeaders = [];
    for (var name in this._expectedHeaders) {
      var expected = this._expectedHeaders[name];
      var actual = res.headers[name];
      if (name === "content-type") {
        if (!actual || actual.indexOf(expected) + actual.indexOf("*/*") === -2) {
          badHeaders.push(name);
        }
      } else if (actual !== expected) {
        badHeaders.push(name);
      }
    }
    if (badHeaders.length) {
      var err = new Error("Error in headers: " + badHeaders.join(", "));
      err.actual = res.headers;
      err.expected = this._expectedHeaders;
      throw err;
    }
  });
  return this;
};

Verity.prototype.clearExpectedHeaders = function() {
  this._expectedHeaders = {};
};

Verity.prototype.expectBody = function(expected) {
  this.expect("Body", function(res) {
    try {
      assertObjectEquals(res.body, expected);
    } catch (err) {
      err.actual = res.body;
      err.expected = expected;
      throw err;
    }
  });
  return this;
};

Verity.prototype.expectPartialBody = function(expected) {
  this.expect("Body", function(res) {
    try {
      isSubset(expected, res.body);
    } catch (err) {
      err.actual = res.body;
      err.expected = expected;
      throw err;
    }
  });
  return this;
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

var formatHeader = function(title) {
  var logChar = "#";
  var row1 = "";
  var row2 = " " + title + " ";
  var row3 = "";
  while(row1.length < row2.length) {
    row1 = row1 + logChar;
    row3 = row3 + logChar;
  }
  for (var i = 0; i < 10; i++) {
    row1 = logChar + row1 + logChar;
    row2 = logChar + row2 + logChar;
    row3 = logChar + row3 + logChar;
  }

  return "\n\n" + [row1, row2, row3].join("\n") + "\n\n";
};

Verity.assertObjectEquals = assertObjectEquals;
Verity.prototype.assertObjectEquals = assertObjectEquals;
Verity.isSubset = isSubset;
Verity.prototype.isSubset = isSubset;

module.exports = Verity;
