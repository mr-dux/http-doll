const path = require('path');
const fs = require('fs');

const http = require('http');
const url = require("url");
const net = require("net");

const HTTP_METHODS = ["GET", "HEAD", "POST", "OPTIONS", "PUT", "PATCH", "DELETE", "TRACE", "CONNECT"];
const ENV = process.env;

/***** logs *****/
const DEBUG = 'debug';
const TRACE = 'trace';
const ERROR = 'error';
const WARN = 'warn';
const INFO = 'info';
const LOG = 'log';
const NONE = 'none';
const LOG_TYPES = [DEBUG, TRACE, ERROR, WARN, INFO, LOG, NONE];

var log_time = true;
var log_level = [LOG, INFO, WARN, ERROR];

var configuration = {};
var dynamic_mode = true;
var port = ENV.PORT || '8000';
var cfg_path;
try {
    cfg_path = fs.realpathSync(ENV.CFG_PATH || 'config.json');
} catch (e) {
    log("Configuration file read error: " + e.toString(), ERROR);
    log(e.stack, TRACE);
    process.exit(1)
}
log("Read configuration from path: " + cfg_path, INFO);
if (!refreshConfig()) process.exit(1);


log("dynamic_mode - " + dynamic_mode, INFO);
log("log_time: " + log_time, INFO);
log("Logs: " + log_level, INFO);

/* TODO
 * proxy
 * cfg path
 * readme
 * default headers
 */

const server = new http.Server(function (req, res) {
    try {
        const ip = req.connection.remoteAddress || req.socket.remoteAddress ||
            (req.connection.socket ? req.connection.socket.remoteAddress : undefined);
        log(getBeautifulIpLog(ip, req.url), INFO);

        if (dynamic_mode) refreshConfig();

        if (!authorization(req, ip)) {
            log("Authorization fail for \x1b[47m" + ip + "\x1b[0m, query: " + req.url + "\x1b[0m", WARN);
            res.writeHead(403);
            res.end("Access allowed only for registered users");
            return;
        }

        const response = configuration.response;
        if (response) {
            const find = findResponse(response, req);
            if (find) {
                if (find.proxy) {
                    //TODO
                }
                if (find.filePath) {
                    const file = getFileFromPath(find.filePath);
                    if (file) {
                        sentResponse(file, res, find);
                        return;
                    } else log("Read file error \"" + find.filePath + "\"", WARN);
                }
                if (find.string) {
                    sentResponse(find.string, res, find);
                    return;
                }
                sentResponse(undefined, res, find);
            } else throw Error("Not found response for query: " + req.url);
        } else throw Error("No response in configuration");
    } catch (e) {
        res.writeHead(404);
        res.end(e.toString());
        log(e.toString(), ERROR);
    }
});
server.on("error", function (e) {
    if (e.toString().indexOf("Error: listen EADDRINUSE") !== -1) {
        log("Port " + port + " busy (" + e.toString() + ")", ERROR);
    } else log("Server error: " + e.toString(), ERROR);
    log(e.stack, TRACE);
    process.exit(1)
});
server.listen(port);

log("Server start on port: \x1b[32m" + port + "\x1b[0m");

function sentResponse(data, res, cfgRes) {
    setTimeout(function () {
        res.writeHead((cfgRes.code || 200), (cfgRes.headers || undefined));
        res.end(data)
    }, (cfgRes.delay || 0))
}

function getFileFromPath(path) {
    try {
        const realPath = fs.realpathSync(path);
        return fs.readFileSync(realPath);
    } catch (e) {
        log("Read file error from " + "path" + e.toString(), ERROR);
        log(e.stack, TRACE);
    }
}

function authorization(req, ip) {
    try {
        if (!configuration.security) return true;
        const secIp = configuration.security.ip;
        if (!ip && secIp) throw Error("Can't determine the IP of the request: " + req.url, ERROR);
        if (secIp && ip !== "::1") {
            var ipCheck = false;
            for (var i = 0; i < secIp.length; i++) {
                if (!net.isIPv4(secIp[i])) continue;
                if (ip.indexOf(secIp[i]) !== -1) ipCheck = true;
            }
            if (!ipCheck) return;
        }
        const username = configuration.security.username;
        const password = configuration.security.password;

        const header = req.headers['authorization'] || '',
            token = header.split(/\s+/).pop() || '',
            auth = new Buffer(token, 'base64').toString(),
            parts = auth.split(/:/),
            reqUsername = parts[0],
            reqPassword = parts[1];

        if (username && username !== reqUsername) return;
        if (password && password !== reqPassword) return;

        return true;
    } catch (e) {
        log("Authorization: " + e.toString(), ERROR);
        log(e.stack, TRACE);
    }
}

function findResponse(response, req) {
    const reqParseUrl = url.parse(req.url, true);
    const reqPathname = reqParseUrl.pathname;
    const reqParams = reqParseUrl.query;

    for (var i = 0; i < response.length; i++) {
        const item = response[i];
        const resParseUrl = url.parse(item.path, true);
        const resPathname = resParseUrl.pathname;
        if (resPathname !== reqPathname) continue;

        if (item.method && item.method !== req.method) continue;

        //params
        const resParamsFromUrl = resParseUrl.query;
        const resParamsFromCfg = item.params;
        for (var key in resParamsFromCfg) resParamsFromUrl[key] = resParamsFromCfg[key];

        var isParamsEquals = true;
        for (var _key in resParamsFromUrl) {
            if (resParamsFromUrl[_key].toString() !== reqParams[_key]) {
                isParamsEquals = false;
                break;
            }
        }
        if (!isParamsEquals) continue;

        item.id = i;
        return item;
    }
}

function refreshConfig() {
    try {
        log("Read configuration from: " + cfg_path, DEBUG);
        const fileRes = JSON.parse(fs.readFileSync(cfg_path, 'utf8'));
        if (typeof fileRes !== "object") throw Error("Parse: the configuration must be a JSON array or object");
        const isArray = Object.prototype.toString.call(fileRes) === "[object Array]";
        log("Configuration is js " + (isArray ? "array" : "object"), DEBUG);
        if (isArray) parseArrayConfig(fileRes);
        else parseObjectConfig(fileRes);
        return true;
    }
    catch (e) {
        log(e.toString(), ERROR);
        log(e.stack, TRACE)
    }
}

function parseObjectConfig(objCfg) {
    if (Object.keys(objCfg).length === 0) {
        log("Configuration \"" + cfg_path + "\" is empty", WARN);
        return;
    }
    const newCfg = {};
    if (objCfg.port && !ENV.PORT) {
        port = validField(objCfg.port, "port", "number");
        if (!port || !(port > 0) || !(port < 65536)) {
            port = 8000;
            log("Port should be a number > 0 and < 65536", ERROR)
        }
    }

    const _log_level = validateLogLevel(objCfg.log_level);
    if (_log_level) log_level = _log_level;
    else log_level = [LOG, INFO, WARN, ERROR];
    if (validField(objCfg.log_time, "log_time", "boolean")) log_time = objCfg.log_time;
    else log_time = false;
    if (validField(objCfg.security, "security", "object")) {
        newCfg.security = {};
        newCfg.security.username = validField(objCfg.security.username, "username", "string");
        newCfg.security.password = validField(objCfg.security.password, "password", "string");
        newCfg.security.ip = validateIp(objCfg.security.ip);
    }
    else newCfg.security = {};
    configuration = newCfg;
    const response = objCfg.response;
    if (response) {
        const isArray = Object.prototype.toString.call(response) === "[object Array]";
        if (!isArray) log("Invalid \"response\" field type, expects array");
        else parseArrayConfig(response);
    }
}

function parseArrayConfig(arrayCfg) {
    if (arrayCfg.length === 0) {
        log("Configuration \"" + cfg_path + "\" is empty", WARN);
        return;
    }
    const response = [];
    arrayCfg.forEach(function (resElem, i) {
        response.push(parseResponseCfg(resElem, i))
    });
    configuration.response = response;
}

function parseResponseCfg(resElem, id) {
    try {
        const res = {};
        const name = resElem.name;
        const path = resElem.path;
        const proxy = resElem.proxy;
        const filePath = resElem.filePath;
        const string = resElem.string;
        res.name = validField(name, "name", "string");
        res.path = validField(path, "path", "string", true);
        res.proxy = validField(proxy, "proxy", "string");
        res.filePath = validField(filePath, "filePath", "string");
        res.string = validField(string, "string", "string");
        /*if (!res.string && !res.proxy && !res.filePath)
            throw Error("response \"" + (name || id) + "\" must have \"filePath\", \"string\" or \"proxy\" valid fields");*/
        if (!proxy) res.string = validField(string, "string", "string");
        const validMethod = validField(resElem.method, "method", "string");
        if (validMethod && HTTP_METHODS.indexOf(validMethod) !== -1) res.method = validMethod;
        else if (validMethod !== undefined) log("\"method\" value \"" + validMethod + "\" is not valid", WARN);
        res.params = validField(resElem.params, "params", "object");
        res.code = validField(resElem.code, "code", "number");
        res.delay = validField(resElem.delay, "delay", "number");
        res.headers = validField(resElem.headers, "headers", "object");
        return res;
    } catch (e) {
        log(e.toString(), ERROR);
        log(e.stack, TRACE)
    }
}

function validateIp(ip) {
    const validObj = validField(ip, "ip", "object");
    if (!validObj) return;
    if (Object.prototype.toString.call(validObj) !== "[object Array]") {
        log("ip must be an array of strings", ERROR);
        return;
    }
    const ipToCfg = [];
    validObj.forEach(function (item) {
        if (net.isIPv4(item)) ipToCfg.push(item);
        else log(item + " - not IPv4", ERROR)
    });
    return ipToCfg.length === 0 ? undefined : ipToCfg;
}

function validateLogLevel(logLevel) {
    if (typeof logLevel === "string")
        if (LOG_TYPES.indexOf(logLevel) !== -1) return logLevel;
        else {
            log("log_level must be a string or an array of values: " + LOG_TYPES, ERROR);
            return;
        }
    if (Object.prototype.toString.call(logLevel) === "[object Array]") {
        const newLogLevel = [];
        logLevel.forEach(function (item) {
            if (typeof item === "string" && LOG_TYPES.indexOf(item) !== -1) newLogLevel.push(item);
            else log("log_level must be a string one of values: " + LOG_TYPES, ERROR);
        });
        return newLogLevel;
    }
    if (logLevel !== undefined) log("log_level must be a string or an array of values: " + LOG_TYPES, ERROR);
}

function validField(value, name, type, required) {
    const curType = typeof value;
    if (curType === type) return value;
    const msg = ("\"" + name + "\" is incorrect. Expects - " + type + ", current - " + curType + " (" + value + ")");

    if (value !== undefined && !required) log("Field " + msg, WARN);
    else if (value !== undefined) throw Error("Required field " + msg);
    else if (required) throw Error("Response must have: \"" + name + "\" field")
}

function log(message, type) {
    if (message === undefined) return;
    const time = (log_time ?
        "[" + (new Date().toLocaleString("ru", {
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
        })) + "]" : "");
    const msg = String(message).replace("\r", "/");
    if (log_level === NONE) return;
    if (!logLevelCheck(type || LOG)) return;
    switch (type) {
        case INFO:
            console.log("\x1b[42m", "INFO ", "\x1b[0m" + time, msg);
            break;
        case WARN:
            console.log("\x1b[43m", "WARN ", "\x1b[0m" + time, msg);
            break;
        case TRACE:
            console.log("\x1b[47m", "TRACE", "\x1b[0m\x1b[31m" + time, msg, "\x1b[0m");
            break;
        case DEBUG:
            console.log("\x1b[45m", "DEBUG", "\x1b[0m" + time, msg);
            break;
        case ERROR:
            console.log("\x1b[41m", "ERROR", "\x1b[0m\x1b[31m" + time, msg, "\x1b[0m");
            break;
        case LOG:
        default:
            console.log("\x1b[46m", " LOG ", "\x1b[0m" + time, msg);
    }
}

function logLevelCheck(logType) {
    if (typeof log_level === "string") return logType === log_level;
    return log_level.indexOf(logType) !== -1;
}

function getBeautifulIpLog(ip, query) {
    return (
        "\x1b[32mRequest from \x1b[47m" +
        (ip === "::1" ? "localhost" : ip) +
        "\x1b[0m\x1b[32m to: \x1b[47m" +
        query +
        "\x1b[0m"
    );
}