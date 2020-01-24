var properties = PropertiesService.getScriptProperties();

/* --- gcal utils */

function parseStr (str) {
    /*                    1      3            4             5                 7              8 */
    var res = str.match(/^(.*?) (([0-9]{4}\/)?([0-9]{1,2})\/([0-9]{1,2})( ?- ?([0-9]{1,2}))?|(tomorrow))$/i);
    if (!res) throw "Parse error";

    var today = new Date();

    var from = res[8] ? (
        new Date(today.getYear(), today.getMonth(), today.getDate() + 1)
    ) : (
        new Date(
            res[3] ? parseInt(res[3]) : today.getYear(),
            parseInt(res[4]) - 1,
            parseInt(res[5])
        )
    );

    var to = new Date(
        from.getYear(),
        from.getMonth(),
        res[7] ? parseInt(res[7]) + 1 : from.getDate() + 1
    );

    if (to < from) {
        to.setMonth(to.getMonth() + 1);
    }

    if (!res[3] && from < today) {
        from.setYear(from.getYear() + 1);
        to.setYear(to.getYear() + 1);
    }

    return { title: res[1], from: from, to: to };
}

function addEventByStr (str) {
    var res = parseStr(str);
    return CalendarApp.getDefaultCalendar().createAllDayEvent(res.title, res.from, res.to);
}

function getEventList () {
    var today = new Date();
    return CalendarApp.getEvents(
        new Date(today.getYear(), today.getMonth(), today.getDate()),
        new Date('3000/01/01')
    ).sort(function (x, y) {
        return x.getStartTime() < y.getStartTime();
    });
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
            value: "edit:" + event.getId()
        };
    }

    return block;
}

/* --- slack utils */

function postToSlack (text, blocks) {
    return UrlFetchApp.fetch(properties.getProperty("SLACK_WEBHOOK_URL"), {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ text: text || "", blocks: blocks || [] })
    });
}

function openSlackModal (trigger_id, view, push) {
    return UrlFetchApp.fetch('https://slack.com/api/views.' + (push ? 'push' : 'open'), {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + properties.getProperty("SLACK_ACCESS_TOKEN") },
        payload: JSON.stringify({ trigger_id: trigger_id, view: view })
    });
}

/* --- interface */

function doAddEvent (params) {
    var res = addEventByStr(params.text);
    postToSlack("", [
        {
            type: "section",
            text: { type: "mrkdwn", text: ":white_check_mark: *EVENT ADDED* :white_check_mark:" },
        },
        formatEvent(res, true)
    ]);
    return ContentService.createTextOutput("");
}

function doListEvent () {
    var events = getEventList();
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

function actionEdit (event, params) {
    openSlackModal(params.trigger_id, {
        type: "modal",
        title: { type: "plain_text", text: "Edit event" },
        blocks: [
            {
                type: "section",
                text: { type: "mrkdwn", text: "Delete event" },
                accessory: {
                    type: "button",
                    text: { type: "plain_text", text: "Delete" },
                    value: "confirmDelete:" + event.getId()
                }
            }
        ]
    });
    return ContentService.createTextOutput("");
}

function actionConfirmDelete (event, params) {
    openSlackModal(params.trigger_id, {
        type: "modal",
        callback_id: "confirmDelete",
        private_metadata: event.getId(),
        title: { type: "plain_text", text: "Delete event" },
        submit: { type: "plain_text", text: "Delete" },
        close: { type: "plain_text", text: "Cancel" },
        blocks:[
            {
                type: "section",
                text: { type: "mrkdwn", text: "Really delete event ?" }
            }
        ]
    }, true);
    return ContentService.createTextOutput("");
}

function submitDelete (event, params) {
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

function doAction (params) {
    var match = params.actions[0].value.match(/^([^:]+):(.*)$/);
    if (!match) throw "Parse error";

    var event = CalendarApp.getEventById(match[2]);

    if (match[1] == "edit") {
        return actionEdit(event, params);
    } else if (match[1] == "confirmDelete") {
        return actionConfirmDelete(event, params);
    } else {
        throw "Unknown action";
    }
}

function doSubmit (params) {
    var event = CalendarApp.getEventById(params.view.private_metadata);

    if (params.view.callback_id == "confirmDelete") {
        return submitDelete(event, params);
    } else {
        throw "Unknown view";
    }
}

function doPost (e) {
    var params = e.parameter.payload ? JSON.parse(e.parameter.payload) : e.parameter;

    var verificationToken = params.token;
    if (verificationToken != properties.getProperty("SLACK_VERIFICATION_TOKEN")) throw "Invalid token";

    if (params.type) {
        if (params.type == 'block_actions') {
            return doAction(params);
        } else if (params.type == 'view_submission') {
            return doSubmit(params);
        } else {
            throw "Unknown action type";
        }
    } else {
        if (params.text == '') {
            return doHelp();
        } else if (params.text == 'list') {
            return doListEvent();
        } else {
            return doAddEvent(params);
        }
    }

    throw "Unexpedted error";
}
