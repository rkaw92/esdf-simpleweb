var express = require('express');
var when = require('when');
var util = require('util');

function AggregateNotFoundError(aggregateID){
	this.name = 'AggregateNotFoundError';
	this.aggregateID = aggregateID;
	this.HTTPCode = 404;
	this.message = 'Aggregate not found: ' + aggregateID;
};
util.inherits(AggregateNotFoundError, Error);

function MethodError(aggregateID, methodName, message){
	this.name = 'MethodError';
	this.aggregateID = aggregateID;
	this.HTTPCode = 500;
	this.message = 'Method execution error of ' + methodName + ' in aggregateID ' + aggregateID + ': ' + message;
}
util.inherits(MethodError, Error);

function SimpleWebAggregatePresenter(options){
	if(!options){
		options = {};
	}
	this._methodHandler = (typeof(options.methodHandler) === 'function') ? options.methodHandler : function _noMethodHandler(aggregateID, methodName){
		return when.reject(new Error('No method handler function registered in the Web interface instance'));
	};
	/**
	 * A map of AR ID => object representation of the AR state. The value is what the client will see in JSON when requesting the aggregate.
	 */
	this._views = {};
	this._express = express();
	this._setupMiddleware();
}

SimpleWebAggregatePresenter.prototype._setupMiddleware = function _setupMiddleware(){
	var app = this._express;
	
	app.use(express.json());
	app.use(express.urlencoded());
	app.use(app.router);
	app.use(function(err, req, res, next){
		if(err){
			console.error(err);
			res.contentType('application/json');
			res.send(err.HTTPCode ? err.HTTPCode : 500, {errorName: err.name, errorCode: err.code, errorMessage: err.message});
		}
	});
	
	//app.param();
	
	/*app.param('aggregateID', (function(req, res, next, id){
		if(typeof(this._views[id]) === 'object'){
			req.aggregateID = id;
			next();
		}
		else{
			next(new AggregateNotFoundError(id));
		}
	}).bind(this));
	
	app.param('method', function(req, res, next, methodName){
		req.method = methodName;
		next();
	});*/
	
	app.get('/list', (function(req, res, next){
		res.contentType('application/json');
		res.send(200, Object.keys(this._views));
	}).bind(this));
	
	app.get('/view/:aggregateID', (function(req, res, next){
		if(this._views[req.params.aggregateID]){
			res.contentType('application/json');
			res.send(200, this._views[req.params.aggregateID]);
		}
		else{
			next(new AggregateNotFoundError(req.aggregateID));
		}
	}).bind(this));
	
	app.post('/call/:aggregateType/:aggregateID/:aggregateMethod', (function(req, res, next){
		try{
			when(this._methodHandler(req.params.aggregateType, req.params.aggregateID, req.params.aggregateMethod, req.body),
			function _methodSuccess(result){
				res.contentType('application/json');
				res.send(200, ((typeof(result) !== 'undefined') ? result : {result: 'OK'}));
			},
			function _methodFailure(reason){
				next(reason ? reason : new MethodError(req.aggregateID, req.method, 'Unspecified error'));
			});
		}
		catch(err){
			next(err ? err : new MethodError(req.aggregateID, req.method, 'Unspecified error'));
		}
	}).bind(this));
	
	app.post('/dumpBody', function(req, res, next){
		res.contentType('application/json');
		res.send(200, req.body);
	});
};

SimpleWebAggregatePresenter.prototype.start = function start(options){
	if(!options){
		options = {};
	}
	var ip = (options.ip) ? options.ip : '127.0.0.1';
	var port = (options.port) ? options.port : '8080';
	this._express.listen(port, ip);
};

module.exports.SimpleWebAggregatePresenter = SimpleWebAggregatePresenter;