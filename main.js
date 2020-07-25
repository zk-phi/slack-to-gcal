/* --- utils */

function parseStr (str) {
    const format = (
        "^" + /* BOL */
        "(.*?)" + /* 1: any title */
        " +" + /* delimiter */
        /* either ... */
        "(" + (
            "([0-9]{4}\/)?" + /* 3: optional year yyyy/ */
            "([0-9]{1,2}\/)?" + /* 4: optional month MM/ */
            "([0-9]{1,2})" + /* 5: date dd */
            /* and optional ... */
            "(" + (
                " ?- ?" + /* delimiter */
                "([0-9]{1,2})" /* 7: end-date dd */
            ) + ")?"
        ) +
        /* or ... */
        "|" + (
            "(tomorrow|today)" /* 8: tomorrow or today */
        ) +
        /* or ... */
        "|" + (
            /* 9: dow */
            "(mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?)"
        ) + ")" +
        "$" /* EOL */
    );

    var res = str.match(new RegExp(format, "i"));
    if (!res) throw "Parse error";

    var now = new Date();

    var from;
    if (res[8]) {
        res[8] = res[8].toLowerCase();
        if (res[8] == "tomorrow") {
            from = new Date(now.getYear(), now.getMonth(), now.getDate() + 1);
        } else if (res[8] == "today") {
            from = now;
        }
    } else if (res[9]) {
        res[9] = res[9].toLowerCase();
        var todayDow = now.getDay();
        var fromDow = {
            mon: 1, monday: 1, tue: 2, tuesday: 2,
            wed: 3, wednesday: 3, thu: 4, thursday: 4,
            fri: 5, friday: 5, sat: 6, saturday: 6, sun: 0, sunday: 0
        }[res[9]];
        var diff = (7 + fromDow - todayDow) % 7;
        from = new Date(now.getYear(), now.getMonth(), now.getDate() + diff);
    } else {
        from = new Date(
            res[3] ? parseInt(res[3]) : now.getYear(),
            res[4] ? parseInt(res[4]) - 1 : now.getMonth(),
            parseInt(res[5])
        );
    }

    var to = new Date(
        from.getYear(),
        from.getMonth(),
        res[7] ? parseInt(res[7]) + 1 : from.getDate() + 1
    );

    if (to < from) { /* to date is specified but to<from */
        to.setMonth(to.getMonth() + 1);
    }

    if (from < now) {
        if (res[5]) { /* date is specified */
            if (!res[4] && !res[3]) { /* but yyyy/MM is not specified */
                from.setMonth(from.getMonth() + 1);
                to.setMonth(to.getMonth() + 1);
            } else if (!res[3]) { /* but yyyy is not specified */
                from.setYear(from.getYear() + 1);
                to.setYear(to.getYear() + 1);
            }
        } else if (res[9]) { /* only dow is specified */
            from.setDate(from.getDate() + 7);
            to.setDate(to.getDate() + 7);
        }
    }

    return { title: res[1], from: from, to: to };
}

Date.prototype.getAPIDate = function () {
    return this.getYear() + "-" + (this.getMonth() + 1) + "-" + this.getDate();
};

function parseAPIDate (str) {
    var res = str.match(/([0-9]+)-([0-9]+)-([0-9]+)/);
    if (!res) throw "Unexpected date format";

    return new Date(parseInt(res[1]), parseInt(res[2]) - 1, parseInt(res[3]));
}

/* --- slash commands */

function doAddTask (params) {
    var res = params.text.match(/^todo +(.+)$/);
    var task = createTask(res[1]);

    postToSlack("", [
        { type: "divider" },
        formatTask(task, false, true)
    ]);

    return ContentService.createTextOutput("");
}

function doAddEvent (params) {
    var res = parseStr(params.text);
    var event = CalendarApp.getDefaultCalendar().createAllDayEvent(res.title, res.from, res.to);

    postToSlack("", [
        { type: "divider" },
        formatEvent(event, false, true)
    ]);

    return ContentService.createTextOutput("");
}

function doListEventAndTask () {
    var tasks = getTasks();
    if (tasks.length) {
        postToSlack("", [
            {
                type: "section",
                text: { type: "mrkdwn", text: ":card_index_dividers: *TODOs* :card_index_dividers:" },
            },
            { type: "divider" }
        ].concat(tasks.map(function (x) { return formatTask(x, false, true); })));
    }

    var now = new Date();
    var events = CalendarApp.getEvents(
        new Date(now.getYear(), now.getMonth(), now.getDate()),
        new Date('3000/01/01')
    );

    var activeEvents = events.filter(function (e) { return e.getStartTime() <= now; });
    postToSlack("", [
        {
            type: "section",
            text: { type: "mrkdwn", text: ":calendar: *ACTIVE EVENTS* :calendar:" },
        },
        { type: "divider" }
    ].concat(activeEvents.map(function (x) { return formatEvent(x, false, true); })));

    var upcomingEvents = events.filter(function (e) { return e.getStartTime() > now; });
    postToSlack("", [
        {
            type: "section",
            text: { type: "mrkdwn", text: ":calendar: *UPCOMING EVENTS* :calendar:" },
        },
        { type: "divider" }
    ].concat(upcomingEvents.map(function (x) { return formatEvent(x, false, true); })));

    return ContentService.createTextOutput("");
}

function doHelp () {
    postToSlack(
        "USAGE\n" +
        "- `/task hogehoge [yyyy/]mm/dd[-dd]` to add events\n" +
        "- `/task todo hogehoge` to add todos\n" +
        "- `/task list` to see all events"
    );
    return ContentService.createTextOutput("");
}

/* --- button actions */

function doActionEdit (params) {
    var event = CalendarApp.getEventById(params.actions[0].value);

    var from = event.getStartTime();
    var to = event.getEndTime();
    to.setDate(to.getDate() - 1);

    openSlackModal(params.trigger_id, {
        type: "modal",
        title: { type: "plain_text", text: "Edit event" },
        callback_id: "edit",
        private_metadata: event.getId(),
        submit: { type: "plain_text", text: "Save" },
        close: { type: "plain_text", text: "Close" },
        blocks: [
            {
                type: "input",
                element: {
                    type: "plain_text_input",
                    initial_value: event.getTitle(),
                    action_id: "title_value"
                },
                label: { type: "plain_text", text: "Title" },
                block_id: "title"
            }, {
                type: "input",
                element: {
                    type: "datepicker",
                    initial_date: from.getAPIDate(),
                    action_id: "from_value"
                },
                label: { type: "plain_text", text: "From" },
                block_id: "from"
            }, {
                type: "input",
                element: {
                    type: "datepicker",
                    initial_date: to.getAPIDate(),
                    action_id: "to_value"
                },
                label: { type: "plain_text", text: "From" },
                block_id: "to"
            }, {
                type: "divider"
            }, {
                type: "section",
                text: { type: "mrkdwn", text: "Delete this event" },
                accessory: {
                    type: "button",
                    text: { type: "plain_text", text: "Delete" },
                    style: "danger",
                    action_id: "confirmDelete",
                    value: event.getId()
                }
            }
        ]
    });

    return ContentService.createTextOutput("");
}

function doActionEditTask (params) {
    var task = getTask(params.actions[0].value);

    openSlackModal(params.trigger_id, {
        type: "modal",
        title: { type: "plain_text", text: "Edit todo" },
        callback_id: "edit_task",
        private_metadata: task.id,
        submit: { type: "plain_text", text: "Save" },
        close: { type: "plain_text", text: "Close" },
        blocks: [
            {
                type: "input",
                element: {
                    type: "plain_text_input",
                    initial_value: task.title,
                    action_id: "title_value"
                },
                label: { type: "plain_text", text: "Title" },
                block_id: "title"
            }, {
                type: "divider"
            }, {
                type: "section",
                text: { type: "mrkdwn", text: "Delete this todo" },
                accessory: {
                    type: "button",
                    text: { type: "plain_text", text: "Delete" },
                    style: "danger",
                    action_id: "confirmDelete_task",
                    value: task.id
                }
            }
        ]
    });

    return ContentService.createTextOutput("");
}

function doActionConfirmDelete (params) {
    var event = CalendarApp.getEventById(params.actions[0].value);

    openSlackModal(params.trigger_id, {
        type: "modal",
        callback_id: "confirmDelete",
        private_metadata: event.getId(),
        title: { type: "plain_text", text: "Delete event" },
        submit: { type: "plain_text", text: "Delete" },
        close: { type: "plain_text", text: "Back" },
        blocks:[
            {
                type: "section",
                text: { type: "mrkdwn", text: "Really delete this event ?" }
            },
            formatEvent(event, false, false)
        ]
    }, true);

    return ContentService.createTextOutput("");
}

function doActionConfirmDeleteTask (params) {
    var task = getTask(params.actions[0].value);

    openSlackModal(params.trigger_id, {
        type: "modal",
        callback_id: "confirmDelete_task",
        private_metadata: task.id,
        title: { type: "plain_text", text: "Delete todo" },
        submit: { type: "plain_text", text: "Delete" },
        close: { type: "plain_text", text: "Back" },
        blocks:[
            {
                type: "section",
                text: { type: "mrkdwn", text: "Really delete this todo ?" }
            },
            formatTask(task, false, false)
        ]
    }, true);

    return ContentService.createTextOutput("");
}

/* --- modal form submissions */

function doSubmitEdit (params) {
    var event = CalendarApp.getEventById(params.view.private_metadata);
    var title = params.view.state.values.title.title_value.value;
    var from = parseAPIDate(params.view.state.values.from.from_value.selected_date);
    var to = parseAPIDate(params.view.state.values.to.to_value.selected_date);
    to.setDate(to.getDate() + 1);

    var oldEvent = formatEvent(event, true, false);

    event.setTitle(title);
    var event = event.setAllDayDates(from, to);

    postToSlack("", [
        { type: "divider" },
        oldEvent,
        formatEvent(event, false, true)
    ]);

    return ContentService.createTextOutput("");
}

function doSubmitEditTask (params) {
    var task = getTask(params.view.private_metadata);

    var oldTask = formatTask(task, true, false);

    task.title = params.view.state.values.title.title_value.value;
    updateTask(task, task.id);

    postToSlack("", [
        { type: "divider" },
        oldTask,
        formatTask(task, false, true)
    ]);

    return ContentService.createTextOutput("");
}

function doSubmitDelete (params) {
    var event = CalendarApp.getEventById(params.view.private_metadata);

    postToSlack("", [
        { type: "divider" },
        formatEvent(event, true, false)
    ]);

    event.deleteEvent();

    return ContentService.createTextOutput(JSON.stringify({
        response_action: "clear"
    })).setMimeType(ContentService.MimeType.JSON);
}

function doSubmitDeleteTask (params) {
    var task = getTask(params.view.private_metadata);

    postToSlack("", [
        { type: "divider" },
        formatTask(task, true, false)
    ]);

    deleteTask(task.id);

    return ContentService.createTextOutput(JSON.stringify({
        response_action: "clear"
    })).setMimeType(ContentService.MimeType.JSON);
}

/* --- entrypoint */

function doPost (e) {
    var params = e.parameter.payload ? JSON.parse(e.parameter.payload) : e.parameter;

    var verificationToken = params.token;
    if (verificationToken != SLACK_VERIFICATION_TOKEN) throw "Invalid token";

    if (params.type) {
        if (params.type == 'block_actions') {
            if (params.actions[0].action_id == "edit") {
                return doActionEdit(params);
            } else if (params.actions[0].action_id == "edit_task") {
                return doActionEditTask(params);
            } else if (params.actions[0].action_id == "confirmDelete") {
                return doActionConfirmDelete(params);
            } else if (params.actions[0].action_id == "confirmDelete_task") {
                return doActionConfirmDeleteTask(params);
            } else {
                throw "Unknown action";
            }
        } else if (params.type == 'view_submission') {
            if (params.view.callback_id == "edit") {
                return doSubmitEdit(params);
            } else if (params.view.callback_id == "edit_task") {
                return doSubmitEditTask(params);
            } else if (params.view.callback_id == "confirmDelete") {
                return doSubmitDelete(params);
            } else if (params.view.callback_id == "confirmDelete_task") {
                return doSubmitDeleteTask(params);
            } else {
                throw "Unknown view";
            }
        } else {
            throw "Unknown action type";
        }
    } else {
        if (params.text == '') {
            return doHelp();
        } else if (params.text == 'list') {
            return doListEventAndTask();
        } else if (params.text.match(/^todo/)) {
            return doAddTask(params);
        } else {
            return doAddEvent(params);
        }
    }

    throw "Unexpedted error";
}
