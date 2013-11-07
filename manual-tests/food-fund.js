var Presenter = require('../SimpleWebAggregatePresenter').SimpleWebAggregatePresenter;
var Router = require('../SimpleWebAggregateEventRouter').SimpleAggregateViewEventRouter;
var esdf = require('esdf');
var util = require('util');
var when = require('when');
var RedisEventStore = require('esdf-store-redis');
var redisClient = RedisEventStore.redis.createClient();
var redisMessagingClient = RedisEventStore.redis.createClient();

function FoodPayment(who, amount, date, items){
	this.who = who;
	this.amount = Math.round(Number(amount) * 100) / 100; // Rounded to 2 decimal places.
	this.date = new Date(date);
	this.items = items;
}

function PurchasedFoodItem(itemName, itemCount, beneficiary){
	this.itemName = String(itemName);
	this.itemCount = Number(itemCount);
	this.beneficiary = String(beneficiary);
}

function FoodPaymentTracker(){
	this._pastPayments = [];
}
util.inherits(FoodPaymentTracker, esdf.core.EventSourcedAggregate);
FoodPaymentTracker.prototype._aggregateType = 'FoodPaymentTracker';

FoodPaymentTracker.prototype.onPaymentRegistered = function onPaymentRegistered(event){
	this._pastPayments.push(event.eventPayload.payment);
};

FoodPaymentTracker.prototype.registerPayment = function registerPayment(payment){
	//TODO: Guard clause: disallow decisions based on old state, force view refresh (maybe).
	//TODO: Verify correctness (completeness) of the provided payment object.
	this._stageEvent(new esdf.core.Event('PaymentRegistered', {
		payment: new FoodPayment(payment.who, payment.amount, payment.date, payment.items),
		nextPayer: this.designateNextPayer(payment)
	}));
	console.log('* Payment registered:', payment);
};

FoodPaymentTracker.prototype.registerPayer = function registerPayer(paymentStub){
	var fullPayment = new FoodPayment(paymentStub.who, 0.00, new Date(), []);
	return this.registerPayment(fullPayment);
};

FoodPaymentTracker.prototype.designateNextPayer = function designatePayer(payment){
	// Empty at first, filled in dynamically when iterating the payment history.
	var potentialPayers = {};
	this._pastPayments.concat([payment]).forEach(function(payment){
		potentialPayers[payment.who] = ((typeof(potentialPayers[payment.who]) === 'undefined') ? Number(payment.amount) : (potentialPayers[payment.who] + Number(payment.amount)));
	});
	// Find the payer with the least historic payout.
	var minPayout = Infinity;
	var minPayer;
	console.log('Trying to choose a payer. Candidates:', potentialPayers);
	for(var payer in potentialPayers){
		if(potentialPayers[payer] < minPayout){
			minPayout = potentialPayers[payer];
			minPayer = payer;
		}
	}
	console.log('* Designated a payer:', minPayer);
	return minPayer;
};


var aggregateConstructors = {
	'FoodPaymentTracker': FoodPaymentTracker
};

var sink = new RedisEventStore.RedisEventSink(redisClient);
var streamer = new RedisEventStore.RedisEventStreamer(redisClient, redisMessagingClient, 'foodPayersDisplay', {persistent: false});
var loader = esdf.utils.createAggregateLoader(sink);
var routeMethod = function routeMethod(aggregateType, aggregateID, methodName, args){
	return esdf.utils.tryWith(loader, aggregateConstructors[aggregateType], aggregateID, function(AR){
		return when.promise(function(resolve, reject){
			resolve(AR[methodName].call(AR, args)); // Not "apply" - we assume that the AR follows the named params convention instead of positional, and thus takes one argument only - the params object.
			console.log('* Method called successfully - should commit() soon');
		});
	});
};
var web = new Presenter({methodHandler: routeMethod});
var eventRouter = new Router({
	'PaymentRegistered': function(view, event, commit, isNew){
		console.log('* Handling event:', event);
		console.log('* view isNew:', isNew);
		//console.log('Applying event PaymentRegistered to view', view);
		view.nextPayer = event.eventPayload.nextPayer;
		// Account the item that was bought under the buyer's sub-object.
		var payment = event.eventPayload.payment;
		if(typeof(view.payerSummaries) !== 'object'){
			view.payerSummaries = {};
		}
		if(typeof(view.payerSummaries[payment.who]) !== 'object'){
			view.payerSummaries[payment.who] = {
				total: 0
			};
		}
		view.payerSummaries[payment.who].total += payment.amount;
		// Attribute the purchased items to their respective beneficiaries.
		if(payment.items.length > 0){
			payment.items.forEach(function(item){
				//TODO
				if(!view.beneficiarySummaries[item.beneficiary]){
					view.beneficiarySummaries[item.beneficiary] = {itemCounts: {}};
				}
				view.beneficiarySummaries[item.beneficiary].itemCounts[item.itemName] = 1; //TODO: the 1 is a lie! placeholder only!
			});
		}
	}
}, web._views);
streamer.setPublisher(eventRouter);
streamer.start();
web.start();