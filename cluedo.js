// cluedo.js
//
// Automatic Cluedo Player
// by Saumil Shah

// globals
var persons;      // array for storing person names
var weapons;      // array for storing weapon names
var rooms;        // array for storing room names
var cards;        // concatenation of persons+weapons+rooms
var tuples;       // all tuple combinations
var players;      // player details. name, current room, shadowing whom, etc
var probability;  // probability table cards x players+murder_column
var marked;       // boolean matrix for modifications to the probability table
var command_input;
var commands;
var textarea;
var command_stack;
var last_command;
var me;           // my player index
var queries;      // list of queries asked
var game_started; // once the game is started, changes are locked out
var tuple_sort;   // function for sorting the tuples
var murder_column;   // value = players.length
var murder_person_found;
var murder_weapon_found;
var murder_room_found;
var murder_card_row_cell;
var card_row;     // array for the row of cards

var probability_fix = false; // EXPERIMENTAL

var image_dir = "card_images";

// initialise everything
// invoked after document is loaded
function init() {
   persons = [
      "Scarlett",
      "Plum",
      "Mustard",
      "Green",
      "Peacock",
      "White"
   ];

   weapons = [
      "Dagger",
      "Revolver",
      "Rope",
      "Candlestick",
      "LeadPipe",
      "Spanner"
   ];

   rooms = [
      "Hall",
      "Lounge",
      "DiningRoom",
      "Conservatory",
      "Ballroom",
      "Kitchen",
      "BilliardRoom",
      "Library",
      "Study"
   ];

   game_started = false;
   murder_person_found = false;
   murder_weapon_found = false;
   murder_room_found = false;

   me = -1;

   // populate the cards array and the held_by array
   var allcards = persons.concat(weapons.concat(rooms));

   cards = new Array(allcards.length);

   for(var i = 0; i < allcards.length; i++) {
      cards[i] = new Object;
      cards[i].name = allcards[i];  // card name
      cards[i].held_by = -1;        // who holds this card?
      cards[i].queried = 0;         // how many times was it queried by?
   }

   // bind the Enter key to click the GO button
   // and eventually invoke the command parser
   command_input = document.getElementById("command");
   command_input.value = "";
   var run = document.getElementById("run");
   document.getElementById("slowmotion").checked = true;
   run.onclick = function() { parser(command_input.value);};
   command_stack = new Array();
   last_command = 0;

   command_input.addEventListener("keyup", function(event) {
      event.preventDefault();
      switch(event.keyCode) {
         case 13:                   // enter
            run.click();
            this.value = "";
            break;
         case 38:                   // up arrow
            if(last_command > 0) {
               this.value = command_stack[--last_command];
            }
            break;
         case 40:                   // down arrow
            if(last_command < command_stack.length - 1) {
               this.value = command_stack[++last_command];
            }
            break;
         case 27:                   // escape
            last_command = command_stack.length;
            this.value = "";
      }
   });

   textarea = document.getElementById("command_history");

   // setup command table and make room for display rows
   // accordingly in the textarea
   textarea.rows = setup_command_table() + 2;
   textarea.value = "";
   textarea.readOnly = "true";

   // set the query history to empty
   queries = new Array();

   // bind the Sort By radio buttons
   var radio_pass = document.getElementById("pass");
   var radio_respond = document.getElementById("respond");
   var radio_murder = document.getElementById("murder");

   radio_murder.checked = true;
   tuple_sort = sort_by_murder;

   radio_pass.onchange = radio_change;
   radio_respond.onchange = radio_change;
   radio_murder.onchange = radio_change;

   // show the help text first
   cmd_help();
   console.log("init end");
};

// function to draw the row of cards
function draw_row_of_cards() {
   if(typeof(players) == "undefined") {
      return;
   }

   // initialise the card_row array
   card_row = new Array(players.length + 1);
   for(var i = 0; i < players.length; i++) {
      card_row[i] = new Array(players[i].card_count);
   }
   card_row[murder_column] = new Array(3);

   var output = dom_clear("row_of_cards");
   var table = document.createElement("table");

   var tr = document.createElement("tr");

   var p = 0;
   var c = 0;
   for(var i = 0; i < cards.length; i++) {
      var td = document.createElement("td");
      var image = document.createElement("img");
      image.className = "autoresizeimage";
      image.src = cardface("unknown");
      td.appendChild(image);
      card_row[p][c++] = image;
      if(c == card_row[p].length) {
         c = 0;
         p++;
      }
      tr.appendChild(td);
   }
   table.appendChild(tr);

   tr = document.createElement("tr");
   for(var i = 0; i < players.length; i++) {
      var td = document.createElement("td");
      td.colSpan = card_row[i].length;
      td.className = "goldenyellow";
      var div1 = document.createElement("div");
      var div2 = document.createElement("div");
      div1.innerHTML = players[i].name;
      td.appendChild(div1);
      td.appendChild(div2);
      players[i].card_row_cell = td;
      tr.appendChild(td);
   }
   td = document.createElement("td");
   td.colSpan = 3;
   td.className = "background-orange";
   var div1 = document.createElement("div");
   var div2 = document.createElement("div");
   div1.innerHTML = "Murder Cards";
   td.appendChild(div1);
   td.appendChild(div2);
   murder_card_row_cell = td;
   tr.appendChild(td);
   table.appendChild(tr);
   output.appendChild(table);
}

// function to assemble an image URL and return it
function cardface(card) {
   var image_src = image_dir + "/" + card.toLowerCase() + ".png";
   return(image_src);
}

// function to clear the output DOM element by ID
// and return it
function dom_clear(id) {
   var retval = document.getElementById(id);
   while(retval.firstChild)
      retval.removeChild(retval.firstChild);
   return(retval);
}

var radio_change = function() {
   var radio_pass = document.getElementById("pass");
   var radio_respond = document.getElementById("respond");
   var radio_murder = document.getElementById("murder");

   if(radio_pass.checked) {
      tuple_sort = sort_by_passing;
   }
   else {
      if(radio_respond.checked) {
         tuple_sort = sort_by_responding;
      }
      else {
         tuple_sort = sort_by_murder;
      }
   }
   recalc_tuple_probabilities();
}

function setup_command_table() {
   var counter = 0;

   commands = [
      [
         "help",                       // [0] command name
         false,                        // [1] parameters required
         cmd_help,                     // [2] function to invoke
         "- list available commands",  // [3] help text
         false,                        // [4] add to command history stack
         true                          // [5] display in the help command list
      ],
      [
         "set players",
         true,
         cmd_set_players,
         "<list of player names beginning with the dealer>",
         true,
         true
      ],
      [
         "i am",
         true,
         cmd_who_am_i,
         "<player name that will be played by the computer>",
         true,
         true
      ],
      [
         "i have",
         true,
         cmd_i_have_card,
         "<name of card I have in my hand>",
         true,
         true
      ],
      [
         "assign person",
         true,
         cmd_assign_person,
         "<person player>",
         true,
         true
      ],
      [
         "begin play",
         false,
         cmd_begin_play,
         "- Once play starts, changes are locked out",
         true,
         true
      ],
      [
         "my room",
         true,
         cmd_set_my_room,
         "<name of the room I am in during this turn>",
         true,
         false
      ],
      [
         "enter room",
         true,
         cmd_set_room,
         "<player room>",
         true,
         true
      ],
      [
         "exit room",
         true,
         cmd_leave_room,
         "<player>",
         true,
         true
      ],
      [
         "query by",
         true,
         cmd_query_by,
         "<player/me person weapon room>",
         true,
         true
      ],
      [
         "response by",
         true,
         cmd_response_by,
         "<player card>",
         true,
         true
      ],
      [
         "response passed",
         false,
         cmd_response_passed,
         "- when no one has any card belonging to the query",
         true,
         true
      ],
      [
         "show history",
         false,
         cmd_print_history,
         "- prints the command history [info]",
         false,
         true
      ],
      [
         "print tuples",
         false,
         cmd_print_tuples,
         "- prints possible murder combinations still remaining [info]",
         false,
         false
      ],
      [
         "print probabilities",
         false,
         cmd_print_probability_table,
         "- prints the probability table [info]",
         false,
         false
      ],
      [
         "print queries",
         false,
         cmd_print_queries,
         "- prints the query history [info]",
         false,
         false
      ],
      [
         "initialise probabilities",
         false,
         cmd_initialise_probability_table,
         "- warning will reset the whole game! [debug]",
         false,
         false
      ]
   ];

   for(var i = 0; i < commands.length; i++) {
      if(commands[i][5]) {
         counter++;
      }
   }
   return(counter);
}

// can submit a semicolon separated list of multiple commands
// useful especially when testing an entire game script
function parser(command_string) {
   var command_list = command_string.replace(/\s*\/\*.*\*\/\s*/g, "")
                                    .replace(/\s*;\s+/g, ";")
                                    .replace(/;+/g, ";")
                                    .replace(/\s+/g, " ")
                                    .replace(/(\s*;$)|(^\s*;)/g, "").split(/;/);
   if(command_list[0] == "") {
      console.log("empty command string");
      return;
   }
   console.log(command_list.length + " commands submitted");
   var interval = 0;

   var slowmotion = document.getElementById("slowmotion").checked;

   for(var i = 0; i < command_list.length; i++) {
      var f = function(x) {run_single_command(x);};
      setTimeout(f, interval, command_list[i]);
      interval += slowmotion ? 1000 : 100;    // 1 second intervals
   }
}

// run a single Cluedo command
var run_single_command = function(command_string) {
   var command_array = command_string.replace(/[^A-Za-z0-9]/g, " ")
                                     .replace(/\s+/g, " ")
                                     .replace(/\s$/g, "").split(/ /);


   var command = command_array[0];

   // "help" is the only command that has no parameters
   // all other commands are two words long.
   if(command != "help") {
      command += " " + command_array[1];
   }
   command_array.shift();
   command_array.shift();
   var params = command_array.join(" ");

   for(var i = 0; i < commands.length; i++) {
      if(command.toLowerCase() == commands[i][0]) {
         var params_required = commands[i][1];
         var command_function = commands[i][2];
         var response;
         if(params_required) {
            response = command_function(params);
         }
         else {
            response = command_function();
         }
         if(commands[i][4]) {
            add_command_history(commands[i][0], params, response);
         }
         return;
      }
   }
   console.log(command + ": not a valid command");
}

function add_command_history(command, params, response) {
   var command_string = command;
   var command_string;
   if(params != "") {
      command_string += " " + params;
   }
   command_stack.push(command_string);
   // record the command in the history box
   textarea.value = command_string + " [" + response + "]\n" + textarea.value;
   last_command = command_stack.length;
}

// create an array of all possible tuples
// this will be called only after the computer
// is mapped to a player using the "I am" command
function generate_combinations() {
   tuples = [];
   for(var i = 0; i < persons.length; i++) {
      for(var j = 0; j < weapons.length; j++) {
         for(var k = 0; k < rooms.length; k++) {
            var tuple = new Object;
            tuple.person = i;
            tuple.weapon = j;
            tuple.room = k;
            tuple.eliminated = false;
            tuple.pass_weight = 0;
            tuple.show_weight = 0;
            tuple.query_sum = 0;       // sum of queries against each card
            tuple.asked_by = -1;
            tuple.candidate = false;   // candidate for next query

            // create an array of likelihoods of passing by players
            tuple.pass_probability = new Array(players.length);
            tuple.show_probability = new Array(players.length);
            for(var p = 0; p < players.length; p++) {
               tuple.pass_probability[p] = -1;
               tuple.show_probability[p] = -1;
            }

            tuples.push(tuple);
         }
      }
   }
}

// sort function for sorting tuples in descending order
// based on the probability of a player passing
var sort_by_passing = function(a, b) {
   return(b.pass_weight - a.pass_weight);
}

// sort function for sorting tuples in ascending order
// based on the probability of a player responding
var sort_by_responding = function(a, b) {
   return(a.show_weight - b.show_weight);
}

// sort function for sorting tuples in descending order
// based on the total probability of the murder cards
var sort_by_murder = function(a, b) {
   if(b.murder_weight == a.murder_weight) {
      return(a.query_sum - b.query_sum);
   }
   return(b.murder_weight - a.murder_weight);
}

// function to search for a tuple
function tuple_search(card1, card2, card3) {
   var person = -1, weapon = -1, room = -1;

   if(persons.indexOf(card1) != -1) { person = persons.indexOf(card1); }
   if(persons.indexOf(card2) != -1) { person = persons.indexOf(card2); }
   if(persons.indexOf(card3) != -1) { person = persons.indexOf(card3); }

   if(weapons.indexOf(card1) != -1) { weapon = weapons.indexOf(card1); }
   if(weapons.indexOf(card2) != -1) { weapon = weapons.indexOf(card2); }
   if(weapons.indexOf(card3) != -1) { weapon = weapons.indexOf(card3); }

   if(rooms.indexOf(card1) != -1) { room = rooms.indexOf(card1); }
   if(rooms.indexOf(card2) != -1) { room = rooms.indexOf(card2); }
   if(rooms.indexOf(card3) != -1) { room = rooms.indexOf(card3); }

   for(var i = 0; i < tuples.length; i++) {
      if(tuples[i].person == person &&
         tuples[i].weapon == weapon &&
         tuples[i].room == room) {
         return(tuples[i]);
      }
   }
   return(null);
}

// function to check whether the last query was
// answered or not
function query_outstanding() {
   if(queries.length > 0) {
      return(!queries[queries.length - 1].answered);
   }
   return(false);
}

// function to recalculate the remaining probabilities
// in the probability table
function recalc_remaining_probabilities() {
   var changed = false;
   var count, sum, p;
   for(var i = 0; i < cards.length; i++) {
      count = 0;
      sum = 1;
      for(var j = 0; j < players.length + 1; j++) {
         if(!marked[i][j]) {
            count++;
         }
         else {
            sum -= probability[i][j];
         }
      }
      p = sum / count;
      for(var j = 0; j < players.length + 1; j++) {
         if(!marked[i][j]) {
            if(probability[i][j] != p) {
               changed = true;
            }
            probability[i][j] = p;
            if(p == 1) {
               //cards[i].held_by = j;
               mark_held_by(i, j);
            }
         }
      }
   }

   // total up the player columns once again to
   // see if all the cards have been inferred
   for(var j = 0; j < players.length; j++) {
      validate_player_cards(j);
   }

   // total up the murder column to see if
   // a murder card is inferred
   recalc_murder_probability(persons, get_person);
   recalc_murder_probability(weapons, get_weapon);
   recalc_murder_probability(rooms, get_room);

   return(changed);
}

// function to mark a card as held by a specific player
// if the player turns out to be the murder column, then
// mark the boolean flags per card group (i.e. person/weapon/room)
// as discovered
//
// this function might get called multiple times for the same card, player
// pair
function mark_held_by(card, player) {
   // if card is already marked as held by, then return
   if(cards[card].held_by == player) {
      return;
   }

   // show the card face in the card row
   if(player != murder_column) {
      card_row[player][players[player].cards_guessed].src =
         cardface(cards[card].name);
   }
   else {
      // ugly search
      card_row[murder_column][get_murder_cards_guessed()].src =
         cardface(cards[card].name);
   }

   // mark the card as held by the player/murder column
   cards[card].held_by = player;

   if(player == murder_column) {
      if(persons.indexOf(cards[card].name) != -1) {
         murder_person_found = true;
         return;
      }
      if(weapons.indexOf(cards[card].name) != -1) {
         murder_weapon_found = true;
         return;
      }
      if(rooms.indexOf(cards[card].name) != -1) {
         murder_room_found = true;
         return;
      }
   }
}

// function to calculate probabilities for a tuple
// being a murder tuple. take the average probability
// of the room, person and weapon
function recalc_tuple_probabilities() {
   var p_person, p_weapon, p_room;
   var index_person, index_weapon, index_room;
   var coefficient;
   var highest_weight = 0;
   var highest_murder_weight = 0;
   var lowest_weight = Math.pow(10, players.length);

   for(var i = 0; i < tuples.length; i++) {
      index_person = get_person(tuples[i].person);
      index_weapon = get_weapon(tuples[i].weapon);
      index_room = get_room(tuples[i].room);

      tuples[i].eliminated = false;    // we shouldn't need to reset it, but..
      tuples[i].candidate = false;

      // calculate total murder probability of all the three cards
      p_person = probability[index_person][murder_column];
      p_weapon = probability[index_weapon][murder_column];
      p_room = probability[index_room][murder_column];

      // heuristic hack
      // if the murder person/weapon/room has been discovered, then any
      // person/weapon/room card that we hold can be set to an equal
      // weight when used in a query
      if(murder_person_found && cards[index_person].held_by == me) {
         p_person = 1;
      }
      if(murder_weapon_found && cards[index_weapon].held_by == me) {
         p_weapon = 1;
      }
      if(murder_room_found && cards[index_room].held_by == me) {
         p_room = 1;
      }

      // heuristic hack
      // sum up the number of times each card has been queried in a tuple.
      // "Hot" cards are those that have been queried quite often.
      // Prefer to use "cooler" cards in the query
      tuples[i].query_sum = cards[index_person].queried +
                            cards[index_weapon].queried +
                            cards[index_room].queried;

      tuples[i].murder_weight = p_person + p_weapon + p_room;

      // if all tuple cards are held by me or in the murder column
      // then eliminate that tuple from the query possibilities
      if(me_or_murderer(index_person) && me_or_murderer(index_weapon) &&
         me_or_murderer(index_room)) {
         tuples[i].eliminated = true;
      }

      // if I have asked this query before, it's stupid of me to ask it
      // again
      if(tuples[i].asked_by == me) {
         tuples[i].eliminated = true;
      }

      // find the likelihood of player[x] passing to the query
      // where x != me
      var will_pass = new Array(players.length);
      var will_show = new Array(players.length);

      var next_player = get_next_responder(me);

      coefficient = Math.pow(10, players.length - 1);
      tuples[i].pass_weight = 0;
      tuples[i].show_weight = 0;

      while(me != -1 && next_player != me) {
         p_person = probability[index_person][next_player];
         p_weapon = probability[index_weapon][next_player];
         p_room = probability[index_room][next_player];

         will_pass[next_player] = (1-p_person) * (1-p_weapon) * (1-p_room);
         will_show[next_player] = maximum(p_person, p_weapon, p_room);

         var j = get_next_responder(me);

         tuples[i].pass_probability[next_player] = will_pass[next_player];
         tuples[i].show_probability[next_player] = will_show[next_player];
         while(j != next_player) {
            tuples[i].pass_probability[next_player] *= will_pass[j];
            tuples[i].show_probability[next_player] *= will_pass[j];
            j = get_next_responder(j);
         }

         tuples[i].pass_weight += tuples[i].pass_probability[next_player] *
                                  coefficient;
         tuples[i].show_weight += tuples[i].show_probability[next_player] *
                                  coefficient;
         coefficient = coefficient / 10;

         if(tuple_sort == sort_by_passing) {
            if(tuples[i].pass_probability[next_player] == 0) {
               tuples[i].eliminated = true;
            }
         }
         else {   // we assume that the same tuples will get eliminated
            if(tuples[i].show_probability[next_player] == 1) {
               tuples[i].eliminated = true;
            }
         }

         next_player = get_next_responder(next_player);
      }

      // update the lowest and highest weights observed
      if(!tuples[i].eliminated) {
         if(tuples[i].show_weight < lowest_weight) {
            lowest_weight = tuples[i].show_weight;
         }
         if(tuples[i].pass_weight > highest_weight) {
            highest_weight = tuples[i].pass_weight;
         }
         if(tuples[i].murder_weight > highest_murder_weight) {
            highest_murder_weight = tuples[i].murder_weight;
         }
      }
   }

   // sort the tuple array
   tuples.sort(tuple_sort);

   // Mark the candidate tuples based on the lowest or highest weights
   for(var i = 0; i < tuples.length; i++) {
      if(!tuples[i].eliminated) {
         switch(tuple_sort) {
            case sort_by_passing:
               if(tuples[i].pass_weight == highest_weight) {
                  tuples[i].candidate = true;
               }
               break;
            case sort_by_responding:
               if(tuples[i].show_weight == lowest_weight) {
                  tuples[i].candidate = true;
               }
               break;
            default:
               if(tuples[i].murder_weight == highest_murder_weight) {
                  tuples[i].candidate = true;
               }
         }
      }
   }

   cmd_print_tuples();
}

function me_or_murderer(card) {
   if(me != -1 && (cards[card].held_by == me ||
                   cards[card].held_by == murder_column)) {
      return(true);
   }
   return(false);
}

function maximum(a, b, c) {
   var retval = a;
   if(b > retval) { retval = b; }
   if(c > retval) { retval = c; }
   return(retval);
}

// function to calculate card index for person number
var get_person = function(r) { return(r); }

// function to calculate card index for weapon number
var get_weapon = function(r) { return(persons.length + r); }

// function to calculate card index for room number
var get_room = function(r) { return(persons.length + weapons.length + r); }

function mark_probability(card, player, p) {
   probability[card][player] = p;
   marked[card][player] = true;
   if(p == 1) {
      //cards[card].held_by = player;
      mark_held_by(card, player);
   }
}

// function to set the probability of a given
// card,player to a 1 and set the remaining
// probabilities to zero
function link(card, player) {
   if(players[player].cards_guessed == players[player].card_count) {
      if(probability[card][player] != 1) {
         return("No you don't");
      }
   }

   for(var j = 0; j < players.length + 1; j++) {
      mark_probability(card, j, 0);
   }
   mark_probability(card, player, 1);
   validate_player_cards(player);

   if(persons.indexOf(cards[card].name) != -1) {
      recalc_murder_probability(persons, get_person);
   }
   if(weapons.indexOf(cards[card].name) != -1) {
      recalc_murder_probability(weapons, get_weapon);
   }
   if(rooms.indexOf(cards[card].name) != -1) {
      recalc_murder_probability(rooms, get_room);
   }

   cmd_print_probability_table();

   return(cards[card].name + " held by " + players[player].name);
}

// function to validate a player's cards
// if all the player's cards have been guessed then
// set the remainder cards' probability to zero
function validate_player_cards(player) {
   players[player].cards_guessed = 0;
   for(var i = 0; i < cards.length; i++) {
      if(probability[i][player] == 1) {
         players[player].cards_guessed++;
      }
   }
   if(players[player].cards_guessed == players[player].card_count) {
      for(var i = 0; i < cards.length; i++) {
         if(probability[i][player] != 1) {
            mark_probability(i, player, 0);
         }
      }
   }
}

// function to run the probability totals of the murder column
function recalc_murder_probability(set, get_index) {
   var suspects = set.length;
   for(var i = 0; i < set.length; i++) {
      if(probability[get_index(i)][murder_column] == 0) {
         suspects--;
      }
      // if we find the suspected card probability = 1
      // then set the probability of all other cards in that group to zero
      if(probability[get_index(i)][murder_column] == 1) {
         for(var j = 0; j < set.length; j++) {
            if(i != j) {
               mark_probability(get_index(j), murder_column, 0);
            }
         }
         return;
      }
   }

   // if only one suspect remains
   if(suspects == 1) {
      for(var i = 0; i < set.length; i++) {
         if(probability[get_index(i)][murder_column] != 0) {
            mark_probability(get_index(i), murder_column, 1);
            return;
         }
      }
   }
}

// function to get the next responder
function get_next_responder(turn) {
   return((turn + 1) % players.length);
}

// function to generate a TD element
function make_cell(s) {
   var cell = document.createElement("td");
   cell.innerHTML = s;
   return(cell);
}

// function to highlight a card row
function highlight(card) {
   document.getElementById(card).className = "highlight";
}

// function to print the help text
var cmd_help = function() {
   textarea.value = "Multiple commands can be concatenated with ';'\n\n" +
                    textarea.value;
   for(var i = commands.length - 1; i >= 0; i--) {
      if(commands[i][5]) {
         textarea.value = commands[i][0] + " " + commands[i][3] + "\n" +
                          textarea.value;
      }
   }
   textarea.value = "\n" + textarea.value;
   return("OK");
}

// the first player is assumed to be the dealer
// the rest of the players are enumerated clockwise
// argument is a string of names separated by spaces
var cmd_set_players = function(player_list) {
   if(game_started) {
      return("Game has already started");
   }

   players = [];
   var player_names = player_list.replace(/[^A-Za-z0-9]+$/, "")
                                 .replace(/ +/g, " ").split(/ /);
   if(player_names.length > 6 || player_names.length < 2) {
      return("This game requires 2-6 players only");
   }

   for(var i = 0; i < player_names.length; i++) {
      var p = new Object;
      p.name = player_names[i];     // player's actual name
      p.room = -1;                  // current room the player is in
      p.person = -1;                // character that the player is shadowing
      p.card_count = 0;             // number of cards that player is dealt
      p.cards_guessed = 0;          // number of cards inferred
      p.card_row_cell = {};
      players.push(p);
   }

   var dealing_to = 1;  // player 0 = dealer, player 1 = starts game

   // 3 cards are taken away as murder cards
   for(var i = 0; i < cards.length - 3; i++) {
      players[dealing_to].card_count++;
      dealing_to = (dealing_to + 1) % players.length;
   }

   murder_column = players.length;
   draw_row_of_cards();
   cmd_initialise_probability_table();
   return(players.length + " players registered");
}

// Create a probability table
// and initialise the probabilities equally
var cmd_initialise_probability_table = function() {
   if(typeof(players) == "undefined") {
      return("No players registered");
   }

   generate_combinations();

   probability = new Array(cards.length);
   marked = new Array(cards.length);
   for(var i = 0; i < cards.length; i++) {
      probability[i] = new Array(players.length + 1);
      marked[i] = new Array(players.length + 1);
      for(var j = 0; j < players.length + 1; j++) {
         probability[i][j] = 1 / (players.length + 1);
         marked[i][j] = false;
      }
   }
   cmd_print_probability_table();
   recalc_tuple_probabilities();
   return("OK");
}

// print a list of remaining tuples
// of possible murder combinations
var cmd_print_tuples = function() {
   if(typeof(players) == "undefined") {
      return("No players registered");
   }

   var output = dom_clear("tuple_list");
   var table = document.createElement("table");

   var header_row = document.createElement("tr");
   header_row.appendChild(make_cell("PERSON"));
   header_row.appendChild(make_cell("WEAPON"));
   header_row.appendChild(make_cell("ROOM"));

   header_row.appendChild(make_cell("Weight"));

   var p = get_next_responder(me);
   while(me != -1 && p != me) {
      header_row.appendChild(make_cell(players[p].name));
      p = get_next_responder(p);
   }

   table.appendChild(header_row);

   for(var i = 0; i < tuples.length; i++) {
      var tr = document.createElement("tr");
      tr.appendChild(make_cell(persons[tuples[i].person] + " (" +
                               cards[get_person(tuples[i].person)].queried +
                               ")"));
      tr.appendChild(make_cell(weapons[tuples[i].weapon] + " (" +
                               cards[get_weapon(tuples[i].weapon)].queried +
                               ")"));
      var td_room = make_cell(rooms[tuples[i].room] + " (" +
                              cards[get_room(tuples[i].room)].queried + ")");

      // colour the room dark orange if we are in it
      if(me != -1 && players[me].room == tuples[i].room &&
         !tuples[i].eliminated) {
         td_room.className = "darkorange";
      }

      tr.appendChild(td_room);

      var weight_value, show_pass;
      switch(tuple_sort) {
         case sort_by_passing:
            weight_value = tuples[i].pass_weight.toFixed(2);
            break;
         case sort_by_responding:
            weight_value = tuples[i].show_weight.toFixed(2);
            break;
         default:
            weight_value = tuples[i].murder_weight.toFixed(2);
      }
      tr.appendChild(make_cell(weight_value));

      p = get_next_responder(me);
      while(me != -1 && p != me) {
         if(tuple_sort == sort_by_passing) {
            show_pass = tuples[i].pass_probability[p].toFixed(2);
         }
         else {
            show_pass = tuples[i].show_probability[p].toFixed(2);
         }
         tr.appendChild(make_cell(show_pass));
         p = get_next_responder(p);
      }

      // if the tuple is eliminated, show it with a strikethrough
      if(tuples[i].eliminated) {
         tr.className = "greyedout";
      }

      // if the tuple is a candidate tuple, set its text to orange
      if(tuples[i].candidate) {
         if(tuples[i].asked_by != -1) {
            tr.className = "red";
         }
         else {
            tr.className = "orange";
         }
      }

      table.appendChild(tr);
   }
   output.appendChild(table);
   return("OK");
}

// print the probability table
var cmd_print_probability_table = function() {
   var changed = false;

   if(typeof(probability) == "undefined") {
      return("Probability Table Not Initialised");
   }

   changed = recalc_remaining_probabilities();

   var output = dom_clear("probability_table");
   var table = document.createElement("table");

   var header_row = document.createElement("tr");
   header_row.appendChild(make_cell(""));

   for(var j = 0; j < players.length; j++) {
      var player_name = players[j].name;
      if(j == me) {
         player_name += " (me)";
      }
      header_row.appendChild(make_cell(player_name));
   }
   header_row.appendChild(make_cell("MURDER"));
   header_row.appendChild(make_cell("Queries"));
   table.appendChild(header_row);

   var murder_cards_guessed = 0;

   for(var i = 0; i < cards.length; i++) {
      var card_row = document.createElement("tr");
      // we will use the row ID to highlight rows when
      // a query is made
      card_row.id = i;
      card_row.appendChild(make_cell(cards[i].name));

      for(var j = 0; j < players.length + 1; j++) {
         var p = make_cell(probability[i][j].toFixed(2));

         if(marked[i][j]) {
            p.className = "marked";
         }
         if(probability[i][j] == 1) {
            p.className = "confirmed";
         }
         if(probability[i][j] == 0) {
            p.className = "greyedout";
         }

         // the last column is for murder cards
         // increment the murder cards guessed count if
         // probability = 1
         if(j == murder_column && probability[i][j] == 1.0) {
            murder_cards_guessed++;
         }
         card_row.appendChild(p);
      }
      card_row.appendChild(make_cell(cards[i].queried));
      table.appendChild(card_row);
   }

   for(var i = 0; i < players.length; i++) {
      players[i].card_row_cell.childNodes[0].innerHTML =
         get_player_guessed_count(i);
      var r = "&nbsp;", p = "";
      if(players[i].room != -1) {
         r = " in " + rooms[players[i].room];
      }
      if(players[i].person != -1) {
         p = persons[players[i].person];
      }
      players[i].card_row_cell.childNodes[1].innerHTML = p + r;
   }

   // report how many murder cards have been guessed so far
   murder_card_row_cell.childNodes[0].innerHTML =
      get_player_guessed_count(murder_column);
   murder_card_row_cell.childNodes[1].innerHTML = "&nbsp;";

   output.appendChild(table);

   if(changed) {
      console.log("table changed, calling print probability again");
      cmd_print_probability_table();
   }
   else {
      recalc_tuple_probabilities();
      highlight_last_query();
      return("OK");
   }
}

// function to count the number of murder cards guessed
// for some reason I can't maintain this as a global variable
// because it gets updated in two different places
// maybe when I refactor the code, I will clean this up
function get_murder_cards_guessed() {
   var murder_cards_guessed = 0;
   for(var i = 0; i < cards.length; i++) {
      if(cards[i].held_by == murder_column) {
         murder_cards_guessed++;
      }
   }
   return(murder_cards_guessed);
}

// function to return a string containing
// player_name (cards_guessed / card_count)
function get_player_guessed_count(x) {
   var retval;
   if(x == murder_column) {
      retval = "Murder Cards (" + get_murder_cards_guessed() + "/3)";
   }
   else {
      retval = players[x].name + " (" + players[x].cards_guessed + "/" +
               players[x].card_count + ")";
   }
   return(retval);
}

// function to set which player is the computer playing
var cmd_who_am_i = function(player_name) {
   if(game_started) {
      return("Game has already started");
   }
   if(typeof(players) == "undefined") {
      return("No players registered");
   }
   for(var i = 0; i < players.length; i++) {
      if(player_name.toLowerCase() == players[i].name.toLowerCase()) {
         me = i;

         cmd_print_probability_table();
         return(players[i].name + " is played by the computer");
      }
   }
   return("Player " + player_name + " isn't here");
}

var cmd_set_my_room = function(room_name) {
   if(!game_started) {
      return("Allowed only after play has begun");
   }
   room_name = room_name.replace(/ /g, "").toLowerCase();
   for(var i = 0; i < rooms.length; i++) {
      if(room_name == rooms[i].toLowerCase()) {
         players[me].room = i;
         cmd_print_probability_table();
         cmd_print_tuples();
         return("I am in the " + rooms[players[me].room]);
      }
   }
   return(room_name + " doesn't exist");
}

// function to assign a player to a room
var cmd_set_room = function(player_room) {
   if(!game_started) {
      return("Allowed only after play has begun");
   }
   var param = player_room.split(" ");
   if(param.length < 2) {
      return("Please specify player and room");
   }

   var player;
   if(param[0] == "me") {
      player = me;
   }
   else {
      player = find_player(param[0]);
   }
   if(player == -1) {
      return(param[0] + " is not here");
   }
   var room = rooms.indexOf(param[1]);

   if(room == -1) {
      return(param[1] + ": not a valid room");
   }
   if(player == me) {
      return(cmd_set_my_room(param[1]));
   }
   players[player].room = room;
   cmd_print_probability_table();
   return(players[player].name + " has entered " + rooms[room]);
}

// function to record when a player exits their current room
var cmd_leave_room = function(player_name) {
   if(!game_started) {
      return("Allowed only after play has begun");
   }

   var player;
   if(player_name == "me") {
      player = me;
   }
   else {
      player = find_player(player_name);
   }
   if(player == -1) {
      return(player_name + " is not here");
   }

   var old_room = players[player].room;
   players[player].room = -1;
   cmd_print_probability_table();
   return(players[player].name + " has exited " + old_room);
}

// function to "see" cards that have been dealt to me
var cmd_i_have_card = function(card_name) {
   if(game_started) {
      return("Game has already started");
   }
   if(me == -1) {
      return("Who am I?");
   }
   for(var i = 0; i < cards.length; i++) {
      if(card_name == cards[i].name) {
         return(link(i, me));
      }
   }
   return(card_name + " not a Cluedo card");
}

// function to record a query made by a player
// other than "me"
var cmd_query_by = function(query_string) {
   if(!game_started) {
      return("Allowed only after play has begun");
   }
   if(query_outstanding()) {
      return("Query " + queries.length + " still unanswered");
   }

   var param = query_string.split(" ");
   if(param.length < 4) {
      return("Query incomplete");
   }

   var asked_by;
   if(param[0].toLowerCase() == "me") {
      asked_by = me;
   }
   else {
      asked_by = find_player(param[0]);
   }
   if(asked_by == -1) {
      return("Player " + param[0] + " is not here");
   }
   var tuple = tuple_search(param[1], param[2], param[3]);
   if(tuple == null) {
      return(tuple_string + ": not a valid query");
   }

   // check if player is currently in that room
   // before making the query
   if(players[asked_by].room != tuple.room) {
      return(players[asked_by].name + " is not in " + rooms[tuple.room]);
   }

   // drag the queried person into the query room
   for(var i = 0; i < players.length; i++) {
      if(tuple.person == players[i].person) {
         players[i].room = tuple.room;
         break;
      }
   }

   var id = push_query(asked_by, tuple);

   cmd_print_probability_table();
   cmd_print_queries();
   return("Query ID " + id);
}

// function to search for a player name
// and return the index within the players array
function find_player(name) {
   name = name.toLowerCase();
   for(var i = 0; i < players.length; i++) {
      if(players[i].name.toLowerCase() == name) {
         return(i);
      }
   }
   return(-1);
}

function highlight_last_query() {
   if(queries.length == 0) {
      return;
   }

   var tuple = queries[queries.length - 1].tuple;

   highlight(get_person(tuple.person));
   highlight(get_weapon(tuple.weapon));
   highlight(get_room(tuple.room));
}

// function to make a new query and push it
// in the queries array
function push_query(asked_by, tuple) {
   var query = new Object;

   query.id = queries.length + 1;   // first query has to have ID 1
   query.asked_by = asked_by;
   tuple.asked_by = asked_by;       // also track asked by in tuple
   query.tuple = tuple;
   query.answered = false;
   query.passed = false;
   query.responder = -1;
   query.response_card = -1;

   // maintain a count of how many times has a card been queried
   cards[get_person(tuple.person)].queried++;
   cards[get_weapon(tuple.weapon)].queried++;
   cards[get_room(tuple.room)].queried++;

   queries.push(query);
   return(query.id);
}

// function to print query table
var cmd_print_queries = function() {
   var header_row, heading, query_row, query_element;
   var output = dom_clear("query_history");
   var table = document.createElement("table");

   header_row = document.createElement("tr");
   header_row.appendChild(make_cell("ID"));
   header_row.appendChild(make_cell("ASKED BY"));
   header_row.appendChild(make_cell("PERSON"));
   header_row.appendChild(make_cell("WEAPON"));
   header_row.appendChild(make_cell("ROOM"));
   header_row.appendChild(make_cell("RESPONDER"));
   header_row.appendChild(make_cell("CARD SHOWN"));
   table.appendChild(header_row);

   for(var i = queries.length - 1; i >= 0; i--) {
      query_row = document.createElement("tr");
      query_row.appendChild(make_cell(queries[i].id));
      query_row.appendChild(make_cell(players[queries[i].asked_by].name));
      query_row.appendChild(make_cell(persons[queries[i].tuple.person]));
      query_row.appendChild(make_cell(weapons[queries[i].tuple.weapon]));
      query_row.appendChild(make_cell(rooms[queries[i].tuple.room]));

      if(queries[i].answered) {
         if(queries[i].passed) {
            query_element = "PASSED";
         }
         else {
            query_element = players[queries[i].responder].name;
         }
      }
      else {
         query_element = "pending";
      }
      query_row.appendChild(make_cell(query_element));

      if(queries[i].response_card != -1) {
         query_element = cards[queries[i].response_card].name;
      }
      else {
         query_element = "";
      }
      query_row.appendChild(make_cell(query_element));

      table.appendChild(query_row);
   }
   output.appendChild(table);
   return("OK");
}

// function to implement a PASSED response_card
var cmd_response_passed = function() {
   if(!game_started) {
      return("Allowed only after play has begun");
   }
   if(!query_outstanding()) {
      return("No query is outstanding, response ignored");
   }

   var last_query = queries.length - 1;
   var asked_by = queries[last_query].asked_by;

   var person_index = get_person(queries[last_query].tuple.person);
   var weapon_index = get_weapon(queries[last_query].tuple.weapon);
   var room_index = get_room(queries[last_query].tuple.room);

   var next_player = get_next_responder(asked_by);
   do {
      if(probability[person_index][next_player] == 1 ||
         probability[weapon_index][next_player] == 1 ||
         probability[room_index][next_player] == 1) {
         return(players[next_player].name + " is cheating");
      }
      mark_probability(person_index, next_player, 0);
      mark_probability(weapon_index, next_player, 0);
      mark_probability(room_index, next_player, 0);
      next_player = get_next_responder(next_player);
   } while(next_player != asked_by);

   // check whether the player making the query
   // is holding any of the cards?
   if(probability[person_index][murder_column] == 0 &&
      probability[person_index][asked_by] < 1) {
      link(person_index, asked_by);
   }
   if(probability[weapon_index][murder_column] == 0 &&
      probability[weapon_index][asked_by] < 1) {
      link(weapon_index, asked_by);
   }
   if(probability[room_index][murder_column] == 0 &&
      probability[room_index][asked_by] < 1) {
      link(room_index, asked_by);
   }

   queries[last_query].answered = true;
   queries[last_query].passed = true;

   cmd_print_queries();
   cmd_print_probability_table();
   return("OK");
}

// function to record a response by a player
var cmd_response_by = function(responder_and_card) {
   if(!game_started) {
      return("Allowed only after play has begun");
   }
   if(!query_outstanding()) {
      return("No query is outstanding, response ignored");
   }

   var last_query = queries.length - 1;

   var param = responder_and_card.split(" ");
   var asked_by = queries[last_query].asked_by;
   var responder = find_player(param[0]);
   if(responder == -1) {
      return("Responder " + param[0] + " is not here");
   }

   var card = -1;
   if(asked_by == me || responder == me) {
      if(param.length < 2) {
         return("Card is missing from response by " + param[0]);
      }
      for(var i = 0; i < cards.length; i++) {
         if(cards[i].name.toLowerCase() == param[1].toLowerCase()) {
            card = i;
            break;
         }
      }
   }

   var person_index = get_person(queries[last_query].tuple.person);
   var weapon_index = get_weapon(queries[last_query].tuple.weapon);
   var room_index = get_room(queries[last_query].tuple.room);

   // find out whether the response card actually belongs to the
   // query tuple
   if(card != person_index && card != weapon_index && card != room_index &&
      card != -1) {
      return("Response " + param[1] + " doesn't belong to query " + last_query);
   }

   // and find out whether it is possible for the responder
   // to be actually holding the card
   if(card != -1 && probability[card][responder] == 0) {
      return(param[0] + " can't be holding " + param[1]);
   }

   var next_player = get_next_responder(queries[last_query].asked_by);
   while(next_player != responder) {
      if(probability[person_index][next_player] == 1 ||
         probability[weapon_index][next_player] == 1 ||
         probability[room_index][next_player] == 1) {
         return(players[next_player].name + " is cheating");
      }
      mark_probability(person_index, next_player, 0);
      mark_probability(weapon_index, next_player, 0);
      mark_probability(room_index, next_player, 0);
      next_player = get_next_responder(next_player);
   }

   queries[last_query].answered = true;
   queries[last_query].responder = responder;

   if(card != -1) {
      link(card, responder);
      queries[last_query].response_card = card;
   }
   else {
      // card not seen by the player
      var count = 3;
      if(probability[person_index][responder] == 0) { count--; }
      if(probability[weapon_index][responder] == 0) { count--; }
      if(probability[room_index][responder] == 0) { count--; }

      if(count > 0) {
         var p = 1 / count;
         console.log("count = " + count + " p = " + p);
         if(probability[person_index][responder] != 1 &&
            probability[person_index][responder] != 0) {
            if(p == 1) {
               link(person_index, responder);
            }
            else {
               // ANOMALY MIGHT BE SOLVED HERE
               // commenting out the following line has
               // definitely removed the negative probability problem
               if(probability_fix)
                  mark_probability(person_index, responder, p);
            }
         }
         if(probability[weapon_index][responder] != 1 &&
            probability[weapon_index][responder] != 0) {
            if(p == 1) {
               link(weapon_index, responder);
            }
            else {
               // ANOMALY MIGHT BE SOLVED HERE
               if(probability_fix)
                  mark_probability(weapon_index, responder, p);
            }
         }
         if(probability[room_index][responder] != 1 &&
            probability[room_index][responder] != 0) {
            if(p == 1) {
               link(room_index, responder);
            }
            else {
               // ANOMALY MIGHT BE SOLVED HERE
               if(probability_fix)
                  mark_probability(room_index, responder, p);
            }
         }
      }
   }

   cmd_print_queries();
   cmd_print_probability_table();
   return("OK");
}

var cmd_print_history = function() {
   textarea.value = "\n" + textarea.value;
   for(var i = command_stack.length - 1; i >= 0; i--) {
      textarea.value = command_stack[i] + ";\n" + textarea.value;
   }
   textarea.value = "\n" + textarea.value;
   return("OK");
}

// function to map a player to a token
var cmd_assign_person = function(person_player) {
   if(game_started) {
      return("Game has already started");
   }

   var param = person_player.split(" ");

   if(param.length < 2) {
      return("Please specify player and room");
   }

   var player;
   if(param[1] == "me") {
      player = me;
   }
   else {
      player = find_player(param[1]);
   }
   if(player == -1) {
      return(param[1] + " is not here");
   }

   var person = persons.indexOf(param[0]);

   if(person == -1) {
      return(param[0] + ": not a valid person");
   }

   // check if person is not already shadowed by another player
   for(var i = 0; i < players.length; i++) {
      if(players[i].person == person) {
         return(persons[person] + " being shadowed by " + players[i].name);
      }
   }

   players[player].person = person;
   cmd_print_probability_table();
   return(players[player].name + " is shadowing " + persons[person]);
}

// function to begin play
var cmd_begin_play = function() {
   if(typeof(players) == "undefined") {
      return("No players registered");
   }
   // check if all the players are shadowing a person
   var missing = "";
   for(var i = 0; i < players.length; i++) {
      if(players[i].person == -1) {
         missing += players[i].name + " ";
      }
   }
   if(missing != "") {
      return("Players " + missing + "aren't shadowing anyone");
   }

   // check if the computer is mapped to a player
   if(me == -1) {
      return("Who am I? Please assign me to a player");
   }

   // check if we are holding as many cards as have been dealt to us
   var unseen = players[me].card_count - players[me].cards_guessed;
   if(unseen != 0) {
      return(" I have yet to see " + unseen + " cards");
   }

   // ok we are good to start
   game_started = true;
   return("Game Started");
}
