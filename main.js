var Foursquare = (function () {
  var user = {};
  var accessToken;

  var getAllCheckins = function (options) {
    var deferred = $.Deferred();

    accessToken = options.accessToken;

    fetchUser().then( function () {
      user.checkins.items = [];

      var requests = [];
      for (i=0; i<user.checkins.count; i+=250) {
        var options = {
          limit : 250,
          offset: i
        };
        requests.push( fetchCheckins( options ).then( function (response) { user.checkins.items.push( response.response.checkins.items ) } ) );
      }

      $.when.apply( $, requests ).done( function () {
        user.checkins.items = _.flatten( user.checkins.items );
        deferred.resolve( user.checkins.items );
      });
    });


    return deferred;
  };

  var fetchCheckins = function (options) {
    var deferred = $.Deferred();

    $.get( "https://api.foursquare.com/v2/users/self/checkins", {
      oauth_token : accessToken,
      v : "20141111",
      limit : options.limit || 250,
      offset : options.offset || 0
    }, function (response) {
      deferred.resolve( response );
    });

    return deferred;
  };

  var fetchUser = function () {
    var deferred = $.Deferred();

    $.get( "https://api.foursquare.com/v2/users/self?oauth_token=" + accessToken + "&v=20141111", function (response) {
      user = response.response.user;
      deferred.resolve( response );
    });

    return deferred;
  };

  return {
    getAllCheckins : getAllCheckins
  }
}());

var SwarmaCarta = (function () {
  var user = {};
  var position;
  var map;

  var init = function () {
    $( "#about" ).click( function () {
      $( "#about-modal" ).modal();
    });

    $( "#share" ).click( function () {
      $( "#share" ).button( "loading" );
      share().done( function (shareObjectId) {
        $( "#share" ).button( "reset" );
        var shareUrl = "http://swarmacarta.s3-website-us-east-1.amazonaws.com/#share=" + shareObjectId;
        $( "#modals").html( _.template( $( "#share-modal" ).html() )( {shareUrl : shareUrl} ) );
        $( "#modals > div" ).modal();
      });
    });

    getUserLocation().then( function () {
      initializeMap();
      reactToHash();
    });
  };

  var getUserLocation = function () {
    var deferred = $.Deferred();

    navigator.geolocation.getCurrentPosition( function (response) {
      position = response;
      deferred.resolve();
    }, deferred.reject, {
      enableHighAccuracy : false,
      timeout : 10000,
      maximumAge : 0
    });

    return deferred;
  };

  var reactToHash = function () {
    var match;
    
    match = window.location.hash.match(/#access_token=(\w*)/);
    window.M = match;
    if (match) {
      user.accessToken = match[1];

      $( "#share" ).show();

      fetchCheckins().then( plotCheckins ).then( showContent );

      return;
    }

    match = window.location.hash.match(/#share=(\w*)/);
    if (match) {
      loadShared( match[1] ).then( showContent );

      $( "#new" ).show();

      return;
    }

    showContent();

    $( "#intro-modal" ).modal({
      keyboard : false,
      backdrop : "static"
    });
  };

  var initializeMap = function () {
    map = new google.maps.Map( document.getElementById( "map" ), {
      center : {
        lat : position.coords.latitude,
        lng : position.coords.longitude
      },
      zoom: 11,
      styles : [{"featureType":"landscape","stylers":[{"hue":"#F1FF00"},{"saturation":-27.4},{"lightness":9.4},{"gamma":1}]},{"featureType":"road.highway","stylers":[{"hue":"#0099FF"},{"saturation":-20},{"lightness":36.4},{"gamma":1}]},{"featureType":"road.arterial","stylers":[{"hue":"#00FF4F"},{"saturation":0},{"lightness":0},{"gamma":1}]},{"featureType":"road.local","stylers":[{"hue":"#FFB300"},{"saturation":-38},{"lightness":11.2},{"gamma":1}]},{"featureType":"water","stylers":[{"hue":"#00B6FF"},{"saturation":4.2},{"lightness":-63.4},{"gamma":1}]},{"featureType":"poi","stylers":[{"hue":"#9FFF00"},{"saturation":0},{"lightness":0},{"gamma":1}]}]
    });
  };

  var fetchCheckins = function () {
    var deferred = $.Deferred();

    Foursquare.getAllCheckins( {accessToken : user.accessToken} ).then( function (response) {
      user.checkins = response;
      deferred.resolve();
    });

    return deferred;
  };


  var plotCheckins = function () {
    var markers = [];

    _.each( user.checkins, function (checkin) {
      if (checkin.venue) {
        var position = new google.maps.LatLng(
            checkin.venue.location.lat,
            checkin.venue.location.lng
        );

        var marker = new google.maps.Marker({
          position : position,
          map : map,
          title : checkin.venue.name
        });

        markers.push( marker );

        google.maps.event.addListener( marker, "click", function () {
          $( "#modals").html( _.template( $( "#venue-modal" ).html() )( {checkin : checkin} ) );
          $( "#modals > div" ).modal();
        });
      }
    });

    var bounds = new google.maps.LatLngBounds();
    _.each( markers, function (marker) {
      bounds.extend( marker.getPosition() );
    });
    map.fitBounds( bounds );
  };

  var share = function () {
    var deferred = $.Deferred();

    Parse.initialize("TppV3dU3Hbs7gg7027cq13HWDFOuXr8kWQsbBSs4", "ls4QubII694fiyiYCUfUutXVKd7YOH3jYWgOQii0");
    
    var fileData = {
      base64 : checkinsToParseFile()
    };

    var checkinsFile = new Parse.File( "checkins", fileData )
    checkinsFile.save().then( function (response) {
      console.log( "success", response );
      var shareObject = new Parse.Object( "ShareObject" );
      shareObject.set( "checkinsFile", checkinsFile );
      shareObject.save().then( function (response) {
        deferred.resolve( response.id );
      });
    }, function (error) {
      deferred.reject();
    });

    return deferred;
  };

  var loadShared = function (shareObjectID) {
    var deferred = $.Deferred();

    Parse.initialize("TppV3dU3Hbs7gg7027cq13HWDFOuXr8kWQsbBSs4", "ls4QubII694fiyiYCUfUutXVKd7YOH3jYWgOQii0");

    var ShareObject = Parse.Object.extend( "ShareObject" );
    new Parse.Query( ShareObject ).get( shareObjectID, {
      success : function (shareObject) {
        $.get( shareObject.get( "checkinsFile" ).url(), function (response) {
          user.checkins = parseFileToCheckins( response );
          plotCheckins();
          deferred.resolve();
        });
      },
      error : function () {
        console.log( "Retrieval error." );
      }
    });

    return deferred;
  };

  var checkinsToParseFile = function () {
    return base64.encode( encodeURIComponent( JSON.stringify( user.checkins ) ) );
  };

  var parseFileToCheckins = function (parseFileContent) {
    return JSON.parse( decodeURIComponent( parseFileContent ) );
  };

  var showContent = function () {
    $( "#loading" ).fadeOut();
  };

  return {
    init : init,
    share : share
  }
}());

$( function () {
  SwarmaCarta.init();
});
