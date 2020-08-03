/* --- utils */

/* (str, str, str, str, str) -> { obj: Date, unit: str } */
function _makeDateObjFromMatch (base, y, m, d, absolute, dow) {
    if (absolute) {
        const now = new Date();
        var beforeEOD = now.getHours() < END_OF_DATE_TIME;
        if (absolute == "tomorrow") {
            return new Date(now.getFullYear(), now.getMonth(), now.getDate() + (beforeEOD ? 0 : 1));
        } else if (absolute == "today") {
            return new Date(now.getFullYear(), now.getMonth(), now.getDate() + (beforeEOD ? -1 : 0));
        }
    }

    if (dow) {
        var todayDow = base.getDay();
        var fromDow = {
            mon: 1, monday: 1, tue: 2, tuesday: 2,
            wed: 3, wednesday: 3, thu: 4, thursday: 4,
            fri: 5, friday: 5, sat: 6, saturday: 6, sun: 0, sunday: 0
        }[dow];
        var diff = (7 + fromDow - todayDow) % 7 || 7;
        return new Date(base.getFullYear(), base.getMonth(), base.getDate() + diff);
    }

    var date = new Date(
        y ? parseInt(y) : base.getFullYear(),
        m ? parseInt(m) - 1 : base.getMonth(),
        d ? parseInt(d) : base.getDate()
    );

    if (date <= base) {
        if (!m) { /* month is not specified (only date is specified) */
            date.setMonth(date.getMonth() + 1);
        } else if (!y) { /* year is not specified */
            date.setFullYear(date.getFullYear() + 1);
        }
    }

    return date;
}

function parseStr (str) {
    const format = (
        "^" + /* BOL */
        "(.*?)" + /* 1: any title */
        " +" + /* delimiter */
        /* either ... */
        "(?:" + (
            /* specific date (2:optional yyyy)(3:optional month MM)(4:date dd) */
            "([0-9]{4}\/)?([0-9]{1,2}\/)?([0-9]{1,2})" +
            /* or 5: tomorrow or today */
            "|(tomorrow|today)" +
            /* or 6: a dow */
            "|(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)"
        ) + ")" +
        /* 7: and optional ... */
        "(" + (
            /* delimiter and */
            " ?- ?" +
            /* either ... */
            "(?:" + (
                /* specific date (8:optional yyyy)(9:optional month MM)(10:date dd) */
                "([0-9]{4}\/)?([0-9]{1,2}\/)?([0-9]{1,2})" +
                /* or 11: tomorrow or today */
                "|(tomorrow|today)" +
                /* or 12: a dow */
                "|(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)"
            ) + ")"
        ) + ")?" +
        "$" /* EOL */
    );

    var res = str.match(new RegExp(format, "i"));
    if (!res) return null;

    var now = new Date();

    var from = _makeDateObjFromMatch(
        now, res[2], res[3], res[4],
        res[5] ? res[5].toLowerCase() : "",
        res[6] ? res[6].toLowerCase() : ""
    );

    var to = _makeDateObjFromMatch(
        from, res[8], res[9], res[10],
        res[11] ? res[11].toLowerCase() : "",
        res[12] ? res[12].toLowerCase() : ""
    );
    to.setDate(to.getDate() + 1);

    return { title: res[1], from: from, to: to };
}

Date.prototype.getAPIDate = function () {
    return this.getFullYear() + "-" + (this.getMonth() + 1) + "-" + this.getDate();
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

    if (!res) {
        postToSlack(
            "Parse error: `/task " + params.text + "`\n" +
            "Sample inputs:\n" +
            "- `/task todo foobar`\n" +
            "- `/task foobar monday`\n" +
            "- `/task foobar tomorrow`\n" +
            "- `/task foobar 12/31`\n" +
            "- `/task foobar 12/31-1`"
        );
        return ContentService.createTextOutput("");
    }

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
        new Date(now.getFullYear(), now.getMonth(), now.getDate()),
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
                label: { type: "plain_text", text: "To" },
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
    } else { /* slash command */
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
