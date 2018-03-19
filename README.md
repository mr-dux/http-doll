# http-doll
*Simple server to create http stubs*
## Start
Requires [Node.js](https://nodejs.org/)
* download repository files
* in cmd run **node http-doll.js**
* or **start.bat** for win

## Example
Let's make a primitive configurationn
###### config.json
```json
[
  {
    "path": "/hello",
    "string": "string answer"
  },
  {
    "path": "/mock",
    "filePath": "mock.json" //path to any file for the test
  }
]
```
Then run the server
    
    node http-doll.js
###### CMD
```cmd
LOG  Server start on port: 8000
```
Next, in the browser or using curl send a request to *http://localhost:8000/hello*
###### Response body from /hello

    string answer
and to *http://localhost:8000/mock*
###### Response body from /mock
```json
{
  "mock": "Hi i am mock"
}
```
## API
#### Full configuration
The configuration can be an array or an object. In the case of an array, it can only contain objects of type "response"
```json
{
  "port": 8000,
  "dynamic_mode": true, 
  "log_time": true,
  "log_level": ["log", "info", "warn", "error"],
  "security": {
    "ip": ["10.1.121.10"],
    "username": "user",
    "password": "1234"
  },
  "response": [
    {
      "name": "test_response",
      "method": "GET",
      "path": "/example?id=55",
      "params": {
        "id": 5,
        "name": "mock"
      },
      "filePath": "config.json",
      "string": "default string",
      "code": 200,
      "delay": 2000,
      "headers": {
        "Content-Type": "application/json; charset=utf-8",
        "Keep-Alive": "timeout=120"
      }
    }
  ]
}
```
#### Configuration fields
Value                     | Default                                | Description
:-------------------------|:------------------------------------:  | :-----------------------------------
**port**                  | `8000`                                 | Server port
**dynamic_mode**          | `true`                                 | If true, the server will re-read the configuration from the file each time it is requested
**log_time**              | `true`                                 | Show time in logs
**log_level**             | ``["log", "info", "warn", "error"]``   | A string or an array of values: log, info, warn, error, trace, debug or none
**security**              |                                        | Security params
*security*.**ip**         | -                                      | Array of IPv4 addresses that should be allowed. Requests from "localhost" are not filtered by value ip.
*security*.**username**   | -                                      | HTTP authorization username        *https://**username**:*password*@host*
*security*.**password**   | -                                      | HTTP authorization password *https://*username*:**password**@host*
**response**              |                                        | Description of the response
*response*.**name**       | -                                      | The name is not necessary, but the information in the logs will be clearer
*response*.**method**     | -                                      | HTTP method ("GET", "POST" ...) if the field is not specified, the request will be processed with any method
*response*.**path** (required)    | -                              | Path with or without parameters like: ***/user?id=10***
*response*.**params**     | -                                      | Parameters in the format name-value, overwrite the same parameters from "path"
*response*.**filePath**   | -                                      | The path to the file on the disk that you want to return to the query
*response*.**string**     | -                                      | if "filePath" is not specified or the file cannot be sent, this string is inserted into the response body
*response*.**code**       | -                                      | HTTP response code
*response*.**delay**      | -                                      | Delay before response (ms)
*response*.**headers**    | -                                      | HTTP headers

 