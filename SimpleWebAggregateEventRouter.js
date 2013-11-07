var when = require('when');

function SimpleAggregateViewEventRouter(routingMap, views, missingHandler){
	if(!routingMap){
		throw new Error('SimpleAggregateViewEventRouter requires an event routing map!');
	}
	if(!views){
		throw new Error('SimpleAggregateViewEventRouter requires a reference to an object where the views are to be stored!');
	}
	this._handlerMap = routingMap;
	this._views = views;
	this._missingHandler = (typeof(missingHandler) === 'function') ? missingHandler : function(){};
}

SimpleAggregateViewEventRouter.prototype.routeEvent = function routeEvent(event, originalCommit){
	if(typeof(this._handlerMap[event.eventType]) === 'function'){
		// There is a function registered for this event type. Call it on the AR object.
		var ARID = originalCommit.sequenceID;
		var isNewAggregate = (typeof(this._views[ARID]) !== 'object');
		if(isNewAggregate){
			this._views[ARID] = {};
		}
		this._handlerMap[event.eventType](this._views[ARID], event, originalCommit, isNewAggregate);
	}
	else{
		this._missingHandler(event.eventType);
	}
};

SimpleAggregateViewEventRouter.prototype.publishCommit = function publishCommit(commit){
	commit.events.forEach((function(ev){
		this.routeEvent(ev, commit);
	}).bind(this));
	return when.resolve();
};

module.exports.SimpleAggregateViewEventRouter = SimpleAggregateViewEventRouter;