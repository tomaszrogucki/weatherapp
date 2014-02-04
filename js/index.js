var $ = require('ddd-jquery');
var Backbone = require('backbone');
Backbone.LocalStorage = require('backbone.localstorage');
Backbone.$ = $;
var Handlebars = require("hbsfy/runtime");


// Create Handlebars template helpsers
Handlebars.registerHelper('date', function(dateString) {
	var date = new Date(parseInt(dateString,10)*1000);
	return date.toLocaleTimeString();
});

Handlebars.registerHelper('temp', function(tempString) {
	var temp = Math.round(parseInt(tempString,10));
	return temp;
});

Handlebars.registerHelper('icon', function(icon) {
	var iconMap = {'01d': 'sun', '02d': 'cloudsun', '03d': 'cloud', '04d': 'clouds', '09d': 'cloudrain', '10d': 'cloudsunrain', '11d': 'cloudthunder', '13d': 'cloudsnow', '50d': 'mist', 
			'01n': 'sun', '02n': 'cloudsun', '03n': 'cloud', '04n': 'clouds', '09n': 'cloudrain', '10n': 'cloudsunrain', '11n': 'cloudthunder', '13n': 'cloudsnow', '50n': 'mist'};
	if(iconMap[icon]) {
		return iconMap[icon];
	}
	else {
		return 'sun';
	}
});

// Require Handlebars templates
var locationTemplate = require('../templates/location.hbs');
var searchTemplate = require('../templates/weatherapp.hbs');


// Location model
// This model represents weather data fetched with REST api from a remote server
var Location = Backbone.Model.extend({
	urlRoot: 'http://api.openweathermap.org/data/2.5/weather?',
	url: function() {
		if(this.get('city')) {
			// Lookup by name
			return this.urlRoot + 'q=' + this.get('city') + '&units=metric';
		}
		else {
			// Lookup by coordinates
			return this.urlRoot + 'lat=' + this.get('lat') + '&lon=' + this.get('lon') + '&units=metric';
		}
	},
	destroy: function() {
		// Do not send DELETE request to the server. Just trigger destroy event.
		this.trigger('destroy', this);
		return this;
	},
	validate: function(attrs) {
		if(attrs.lat) return;
		// Save only the locations for which the city name entered by the use matches the one returned by the server
		if(!attrs.name || attrs.name.toUpperCase() !== unescape(attrs.city).toUpperCase()) {
			return 'Error : City not found!';
		}
	}
});

var LocationList = Backbone.Collection.extend({
	model: Location
});

var LocationView = Backbone.View.extend({
	template: locationTemplate,
	events: {
		// Clear view and destroy model if cross button clicked
		'click a.destroy': 'clear'
	},
	initialize: function() {
		this.$el.addClass('location');
		this.model.on('sync', this.render, this);
		this.model.on('destroy', this.remove, this);
	},
	render: function() {
		var html = this.template(this.model.toJSON());
		this.$el.html(html);
		return this;
	},
	clear: function() {
		this.model.destroy();
		return this;
	}
});


// LocationStorage model
// Represents locations stored locally (not to loose data on page reload)
var LocationStorage = Backbone.Model.extend({ });

// This list maps all locations from LocationList
var LocationStorageList = Backbone.Collection.extend({
	model: LocationStorage,
	// Use LocalStorage
	localStorage: new Backbone.LocalStorage('weatherapp'),
	initialize: function(locations) {
		this.locations = locations;
		this.on('add',this.storeLocationStorage);
		// Update this collection each time Location collection changes
		this.listenTo(this.locations, 'add', this.addLocationStorage);
		this.listenTo(this.locations, 'destroy', this.deleteLocationStorage);
		this.fetch({success: this.populate.bind(this)});
	},
	// Add to collection
	addLocationStorage: function(location) {
		// Store only the id and city name or coordinates
		var attributes = {id: location.get('id')}
		if(location.get('city')) {
			attributes.city = location.get('city');
		}
		else if(location.get('lat') && location.get('lon')) {
			attributes.lat = location.get('lat');
			attributes.lon = location.get('lon');
		}
		var locationStorage = new LocationStorage(attributes);
		//TODO: possibly {merge:true}
		var result = this.add(locationStorage);
		return this;
	},
	// Save in LocalStorage
	storeLocationStorage: function(locationStorage) {
		Backbone.sync('update', locationStorage);
		return this;
	},
	deleteLocationStorage: function(location) {
		var locationStorage = this.findWhere({id: location.get('id')});
		Backbone.sync('delete', locationStorage);
		this.remove(locationStorage);
		return this;
	},
	// Populate LocationCollection from LocalStorage on the application startup
	populate: function() {
		this.each(function(locationStorage) {
			var attributes = {};
			if(locationStorage.get('city')) {
				attributes.city = locationStorage.get('city');
			}
			else if(locationStorage.get('lat') && locationStorage.get('lon')) {
				attributes.lat = locationStorage.get('lat');
				attributes.lon = locationStorage.get('lon');
			}
			var location = new Location(attributes);
			location.fetch({success: this.locations.add.bind(this.locations, location, {validate: true})});
		}.bind(this));
		return this;
	}
});


// The main application view
var AppView = Backbone.View.extend({
	el: $('#weatherApp'),
	template: searchTemplate,
	events: {
		'keypress #searchCity': 'searchCity',
		'click #navigationSearch': 'handleClick',
		'click #navigationMap': 'handleClick'
	},
	initialize: function() {
		this.locations = new LocationList();
		this.locationStorages = new LocationStorageList(this.locations);
		this.render();
		this.input = this.$('#searchCity');
		this.listenTo(this.locations, 'add', this.addLocationView);
		this.listenTo(this.locations, 'add', this.addMapView);
		this.listenTo(this.locations, 'remove', this.removeMapView);
		
		// Google maps here
		this.mapOptions = {center: new google.maps.LatLng(57.5167,-23.3833), zoom: 4};
		this.map = new google.maps.Map(document.getElementById("mapBar"), this.mapOptions);
		this.mapDoubleClicked = false;
		google.maps.event.addListener(this.map, 'click', function(event) {
			this.mapDoubleClicked = false;
			setTimeout(function(event) {
				if(!this.mapDoubleClicked) {
					this.mapCity(event.latLng.lat(),event.latLng.lng());
				}
			}.bind(this,event), 200);
		}.bind(this));
		google.maps.event.addListener(this.map, 'dblclick', function() { this.mapDoubleClicked = true; }.bind(this));
		google.maps.event.addListener(this.map, 'drag', function() { google.maps.event.trigger(this.map, 'resize'); }.bind(this) );
		
		// Poll server
		setInterval(this.refresh.bind(this), 10000);
	},
	addLocationView: function(location) {
		var view = new LocationView({model: location});
		this.$el.find('#content').prepend(view.render().el);
		return this;
	},
	addMapView: function(location) {
		var latLng = new google.maps.LatLng(location.get('coord').lat,location.get('coord').lon);
		var marker = new google.maps.Marker({
			position: latLng,
			title: location.get('name'),
			map: this.map
		});
		location.set({'marker': marker});
		return this;
	},
	removeMapView: function(location) {
		location.get('marker').setMap(null);
		return this;
	},
	render: function() {
		var html = this.template();
		this.$el.html(html);
		return this;
	},
	// Search city by name when Enter pressed
	searchCity: function(event) {
		if (event.keyCode !== 13 || !this.input.val()) return;
		var searchLocation = new Location({city: escape(this.input.val().trim())});
		// If fetched model is not valid
		var invalid = function(searchLocation) {
			if(!searchLocation.isValid()) {
				this.printMessage(searchLocation.validationError);
			}
		};
		// Fetch model from RESTful server with the city name as key. If successful, add the model to the collection
		searchLocation.fetch({success: this.locations.add.bind(this.locations,searchLocation), validate: true, complete: invalid.bind(this, searchLocation)});
		this.input.val('');
	},
	// Search city by location when map clicked
	mapCity: function(lat,lon) {
		var mapLocation = new Location({'lat': lat, 'lon': lon});
		var invalid = function(mapLocation) {
			if(!mapLocation.isValid()) {
				this.printMessage(mapLocation.validationError);
			}
		};
		// Fetch model from RESTful server with the city coordinates as key. If successful, add the model to the collection
		mapLocation.fetch({success: this.locations.add.bind(this.locations,mapLocation), validate: true, complete: invalid.bind(this, mapLocation)});
		return this;
	},
	removeLocation: function(location) {
		location.destroy();
		return this;
	},
	// Update models with fresh data from the RESTful server
	refresh: function() {
		this.locations.each(function(location) {location.fetch();});
		return this;
	},
	// Notify the user of any errors
	printMessage: function(message) {
		this.$('#errorBar').html(message).slideDown('slow').delay(5000).slideUp('slow');
		return this;
	},
	// General click handler
	handleClick: function(event) {
		// Wind up/down the city search panel
		if(event.target.id === 'navigationSearch') {
			this.$('#searchWrapper').slideToggle('slow');
			this.input.focus();
		}
		// Wind up/down the map
		if(event.target.id === 'navigationMap') {
			this.$('#mapWrapper').slideToggle('slow', google.maps.event.trigger.bind(this,this.map,'resize'));
			google.maps.event.trigger(this.map, 'resize');
		}
		return this;
	}
	
});

// Initialise the application
var appView = new AppView();
