var Presenter = require('../SimpleWebAggregatePresenter').SimpleWebAggregatePresenter;
var Router = require('../SimpleWebAggregateEventRouter').SimpleAggregateViewEventRouter;
var esdf = require('esdf');
var util = require('util');
var when = require('when');

function Alternator(){
	this._aggregateType = 'Alternator';
	this.flipflop = true;
}
util.inherits(Alternator, esdf.core.EventSourcedAggregate);

Alternator.prototype.onAlternated = function onAlternated(event, commit){
	this.flipflop = !this.flipflop;
};

Alternator.prototype.alternate = function alternate(){
	this._stageEvent(new esdf.core.Event('Alternated', {}));
};

var aggregateConstructors = {
	'Alternator': Alternator
};

var sink = new esdf.test.DummyEventSink();
var streamer = new esdf.test.DummyEventSinkStreamer(sink);
var loader = esdf.utils.createAggregateLoader(sink);
var routeMethod = function routeMethod(aggregateType, aggregateID, methodName, args){
	return (esdf.utils.tryWith(loader, aggregateConstructors[aggregateType], aggregateID, function(AR){
		return when.promise(function(resolve, reject){
			resolve(AR[methodName].call(AR, args)); // Not "apply" - we assume that the AR follows the named params convention instead of positional, and thus takes one argument only - the params object.
		});
	})).then(function(tryWithResult){
	});
};
var web = new Presenter({methodHandler: routeMethod});
var eventRouter = new Router({
	'Alternated': function(view, event, commit, isNew){
		console.log('Applying event Alternated to view', view);
		if(isNew){
			view.status = true;
		}
		view.status = !view.status;
	}
},
web._views);
streamer.setPublisher(eventRouter);
streamer.start();
web.start();