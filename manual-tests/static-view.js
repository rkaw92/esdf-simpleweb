var web = require('../SimpleWebAggregatePresenter').SimpleWebAggregatePresenter;

var webInstance = new web();
webInstance.start();

webInstance._views['music:favourites'] = {items: ['a', 'b']};