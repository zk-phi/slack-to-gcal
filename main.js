var PROPERTIES = PropertiesService.getScriptProperties();
var TASK_LIST_NAME = "TODOs";

/* --- utils */

function parseStr (str) {
    /*                    1      3            4              5                 7              8 */
    var res = str.match(/^(.*?) (([0-9]{4}\/)?([0-9]{1,2}\/)?([0-9]{1,2})( ?- ?([0-9]{1,2}))?|(tomorrow|today|mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?))$/i);
    if (!res) throw "Parse error";

    var today = new Date();

    var from;
    if (res[8]) {
        res[8] = res[8].toLowerCase();
        if (res[8] == "tomorrow") {
            from = new Date(today.getYear(), today.getMonth(), today.getDate() + 1);
        } else if (res[8] == "today") {
            from = today;
        } else {
            var todayDow = today.getDay();
            var fromDow = {
                mon: 1, monday: 1, tue: 2, tuesday: 2,
                wed: 3, wednesday: 3, thu: 4, thursday: 4,
                fri: 5, friday: 5, sat: 6, saturday: 6, sun: 0, sunday: 0
            }[res[8]];
            var diff = todayDow == fromDow ? 7 : (fromDow - todayDow) % 7;
            from = new Date(today.getYear(), today.getMonth(), today.getDate() + diff);
        }
    } else {
        from = new Date(
            res[3] ? parseInt(res[3]) : today.getYear(),
            res[4] ? parseInt(res[4]) - 1 : today.getMonth(),
            parseInt(res[5])
        );
    }

    var to = new Date(
        from.getYear(),
        from.getMonth(),
        res[7] ? parseInt(res[7]) + 1 : from.getDate() + 1
    );

    if (to < from) {
        to.setMonth(to.getMonth() + 1);
    }

    if (!res[4] && !res[3] && from < today) { /* dd */
        from.setMonth(from.getMonth() + 1);
        to.setMonth(to.getMonth() + 1);
    } else if (!res[3] && from < today) { /* MM/dd */
        from.setYear(from.getYear() + 1);
        to.setYear(to.getYear() + 1);
    }

    return { title: res[1], from: from, to: to };
}

function formatEvent (event, withActions) {
    var from = event.getStartTime();
    var to = event.getEndTime();
    to.setDate(to.getDate() - 1);

    var text = "- " + from.toLocaleDateString() + (
        from < to ? " ~ " + to.toLocaleDateString() : ""
    ) + " *" + event.getTitle() + "*";

    var block = {
        type: "section",
        text: { type: "mrkdwn", text: text }
    };

    if (withActions) {
        block.accessory = {
            type: "button",
            text: { type: "plain_text", text: ":pencil2:", emoji: true },
            action_id: "edit",
            value: event.getId()
        };
    }

    return block;
}

function formatTask (task, withActions) {
    var block = {
        type: "section",
        text: { type: "mrkdwn", text: "- " + task.title }
    };

    if (withActions) {
        block.accessory = {
            type: "button",
            text: { type: "plain_text", text: ":pencil2:", emoji: true },
            action_id: "edit_task",
            value: task.id
        };
    }

    return block;
}

Date.prototype.getAPIDate = function () {
    return this.getYear() + "-" + (this.getMonth() + 1) + "-" + this.getDate();
};

function parseAPIDate (str) {
    var res = str.match(/([0-9]+)-([0-9]+)-([0-9]+)/);
    if (!res) throw "Unexpected date format";

    return new Date(parseInt(res[1]), parseInt(res[2]) - 1, parseInt(res[3]));
}

function createTaskList (title) {
    var list = Tasks.newTaskList();
    list.title = title;
    return Tasks.Tasklists.insert(list);
}

function getTaskListIdCreate () {
    var taskLists = Tasks.Tasklists.list().getItems();
    for (var i = 0; i < taskLists.length; i++) {
        if (taskLists[i].title == TASK_LIST_NAME) {
            return taskLists[i].id;
        }
    }
    return createTaskList(TASK_LIST_NAME).id;
}

function getTasks () {
    return Tasks.Tasks.list(getTaskListIdCreate()).items || [];
}

function getTask (id) {
    return Tasks.Tasks.get(getTaskListIdCreate(), id);
}

function deleteTask (id) {
    return Tasks.Tasks.remove(getTaskListIdCreate(), id);
}

function createTask (title) {
    var task = Tasks.newTask();
    task.title = title;
    return Tasks.Tasks.insert(task, getTaskListIdCreate());
}

function updateTask (task, id) {
    return Tasks.Tasks.patch(task, getTaskListIdCreate(), id);
}

function postToSlack (text, blocks) {
    return UrlFetchApp.fetch(PROPERTIES.getProperty("SLACK_WEBHOOK_URL"), {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ text: text || "", blocks: blocks || [] })
    });
}

function openSlackModal (trigger_id, view, push) {
    return UrlFetchApp.fetch('https://slack.com/api/views.' + (push ? 'push' : 'open'), {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + PROPERTIES.getProperty("SLACK_ACCESS_TOKEN") },
        payload: JSON.stringify({ trigger_id: trigger_id, view: view })
    });
}

/* --- interface */

function doAddTask (title) {
    var task = createTask(title);

    postToSlack("", [
        {
            type: "section",
            text: { type: "mrkdwn", text: ":white_check_mark: *TASK ADDED* :white_check_mark:" },
        },
        formatTask(task, true)
    ]);

    return ContentService.createTextOutput("");
}

function doAddEvent (parsedEvent) {
    var event = CalendarApp.getDefaultCalendar().createAllDayEvent(
        parsedEvent.title,
        parsedEvent.from,
        parsedEvent.to
    );

    postToSlack("", [
        {
            type: "section",
            text: { type: "mrkdwn", text: ":white_check_mark: *EVENT ADDED* :white_check_mark:" },
        },
        formatEvent(event, true)
    ]);

    return ContentService.createTextOutput("");
}

function doListEventAndTask () {
    var tasks = getTasks();
    if (tasks.length) {
        postToSlack("", [
            {
                type: "section",
                text: { type: "mrkdwn", text: ":card_index_dividers: *TASKS* :card_index_dividers:" },
            }
        ].concat(tasks.map(function (x) { return formatTask(x, true); })));
    }

    var today = new Date();
    var events = CalendarApp.getEvents(
        new Date(today.getYear(), today.getMonth(), today.getDate()),
        new Date('3000/01/01')
    );
    postToSlack("", [
        {
            type: "section",
            text: { type: "mrkdwn", text: ":calendar: *UPCOMING EVENTS* :calendar:" },
        }
    ].concat(events.map(function (x) { return formatEvent(x, true); })));

    return ContentService.createTextOutput("");
}

function doHelp () {
    postToSlack(
        "USAGE\n" +
        "- `/task hogehoge [yyyy/]mm/dd[-dd]` to add events\n" +
        "- `/task list` to see all events"
    );
    return ContentService.createTextOutput("");
}

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
        title: { type: "plain_text", text: "Edit task" },
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
                text: { type: "mrkdwn", text: "Delete this task" },
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

function doSubmitEdit (params) {
    var event = CalendarApp.getEventById(params.view.private_metadata);
    var title = params.view.state.values.title.title_value.value;
    var from = parseAPIDate(params.view.state.values.from.from_value.selected_date);
    var to = parseAPIDate(params.view.state.values.to.to_value.selected_date);
    to.setDate(to.getDate() + 1);

    event.setTitle(title);
    var event = event.setAllDayDates(from, to);

    postToSlack("", [
        {
            type: "section",
            text: { type: "mrkdwn", text: ":pencil2: *EVENT UPDATED* :pencil2:" },
        },
        formatEvent(event, true)
    ]);

    return ContentService.createTextOutput("");
}

function doSubmitEditTask (params) {
    var task = getTask(params.view.private_metadata);
    task.title = params.view.state.values.title.title_value.value;

    updateTask(task, task.id);

    postToSlack("", [
        {
            type: "section",
            text: { type: "mrkdwn", text: ":pencil2: *TASK UPDATED* :pencil2:" },
        },
        formatTask(task, true)
    ]);

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
            formatEvent(event)
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
        title: { type: "plain_text", text: "Delete task" },
        submit: { type: "plain_text", text: "Delete" },
        close: { type: "plain_text", text: "Back" },
        blocks:[
            {
                type: "section",
                text: { type: "mrkdwn", text: "Really delete this task ?" }
            },
            formatTask(task)
        ]
    }, true);

    return ContentService.createTextOutput("");
}

function doSubmitDelete (params) {
    var event = CalendarApp.getEventById(params.view.private_metadata);

    postToSlack("", [
        {
            type: "section",
            text: { type: "mrkdwn", text: ":wastebasket: *EVENT DELETED* :wastebasket:" },
        },
        formatEvent(event)
    ]);

    event.deleteEvent();

    return ContentService.createTextOutput(JSON.stringify({
        response_action: "clear"
    })).setMimeType(ContentService.MimeType.JSON);
}

function doSubmitDeleteTask (params) {
    var task = getTask(params.view.private_metadata);

    postToSlack("", [
        {
            type: "section",
            text: { type: "mrkdwn", text: ":wastebasket: *TASK DELETED* :wastebasket:" },
        },
        formatTask(task)
    ]);

    deleteTask(task.id);

    return ContentService.createTextOutput(JSON.stringify({
        response_action: "clear"
    })).setMimeType(ContentService.MimeType.JSON);
}

function doPost (e) {
    var params = e.parameter.payload ? JSON.parse(e.parameter.payload) : e.parameter;

    var verificationToken = params.token;
    if (verificationToken != PROPERTIES.getProperty("SLACK_VERIFICATION_TOKEN")) throw "Invalid token";

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
        } else {
            try {
                var parsedEvent = parseStr(params.text);
            } catch (e) {
                return doAddTask(params.text);
            }
            return doAddEvent(parsedEvent);
        }
    }

    throw "Unexpedted error";
}
