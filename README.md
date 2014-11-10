#verity

###integration testing for http requests

###features:
* content-type matching
* application/json response testing with colorized diffs
* responses are verified holistically, for better reporting
* supports cookies
* supports login strategies
* easy url manipulation

###basic usage:

```javascript
  var v = verity("http://localhost:8080/path/");
  v.jsonMode();
  v.method("POST");
  v.body({"some" : "json"});
  v.expectStatus(200);
  v.expectBody({"success" : true});
  v.test(function(err, result) {
    // err is present if any assertions failed.
    // result contains assertion errors, body, headers, status, and cookies
  });
```

or using the chained interface:

```javascript
  var v = verity("http://localhost:8080/path/")
          .jsonMode()
          .method("POST")
          .body({"some" : "json"})
          .expectStatus(200)
          .expectBody({"success" : true})
          .test(function(err, result) {
            // ...
          });
```


###api (instance methods):

####jsonMode()
Call `jsonMode()` to allow json request and response bodies to be automatically serialized and deserialized into javascript objects.

####body(String/Object)
Call `body()` to set the contents of the request body.  This should be a string unless `jsonMode()` has been called.

####method(String)
Call `method()` with an HTTP method to set the HTTP request method.

####header(name, value)
Call `header()` with a header name and value to set a single http
request header.

####setCookieFromString(String)
Call `setCookieFromString()' to pass a cookie string to set the cookie values of the request.

####expectStatus(Number)
Call `expectStatus()` to declare the HTTP status code that you expect the reponse to have.

####expectHeaders(Object)
Call `expectHeaders()` expect certain headers.  Unspecified headers will be ignored.  Further calls will merge the two expectations.

####expectCookie(Object)
Call `expectCookie()` expect certain cookies.  Unspecified cookies will be ignored.  Further calls will merge the two expectations.

####expectBody(String/Object)
Call `expectBody()` to declare what bopdy to expect in the response.  This should be a string unless `jsonMode()` has been called.

####expectPartialBody(Object)
Call `expectPartialBody()` to expect certain response fields.  Unspecified fields will be ignored.  This method will error if JSON mode is not enabled.

####expect(Function)
Call `expect()` to make your own assertions on the response.  You must provide a function that takes the node response object, and throws an error if any expectations are violated.  You may decorate the error with additional properties that will be logged.

####test(cb)
Call `test()` to actually execute the specified request, and test your expectations.  `test()` takes a callback that expects `error` and `result` arguments.  The `error` parameter is truthy if the expectations were not met.  The `result` parameter will contain an object detailing the errors, along with the response.

####authStrategy(fn)
Call authStrategy with a function that takes a credentials object and a callback.  This function should log a user into your app and return a cookie with proper session credentials.

####login(credentials)
After authStrategy has been set, call `login` with a set of credentials to log a user in before running a test.

###api (static methods):

####assertObjectEquals(obj1, obj2)
Asserts that two objects are deeply-equal, and to throw an assertion error if they're not, along with logging the diffs.

####register(fn)
Register your own expect helper, which you will be able to  use in a manner similar to expectBody, expectHeaders, etc.  Should return a function that takes the response object and throws an error if any assertions are not met.  Attach your own properties to the thrown error object to add details.

TODO document use in mocha.  document use in other test frameworks.

TODO document changing the url
