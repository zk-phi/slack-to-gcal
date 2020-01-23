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

    if (from < today) {
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

function formatEvent (event) {
    var from = event.getStartTime();
    var to = event.getEndTime();
    to.setDate(to.getDate() - 1);

    var text = "- *" + event.getTitle() + "*" + (
        from < to ? (
            " from " + from.toLocaleDateString() + " to " + to.toLocaleDateString()
        ) : (
            " at " + from.toLocaleDateString()
        )
    );

    return {
        type: "section",
        text: { type: "mrkdwn", text: text },
        accessory: {
            type: "button",
            text: {type: "plain_text", text: "Delete", emoji: false },
            value: "delete:" + event.getId()
        }
    };
}

/* --- slack utils */

function postToSlack (text, blocks) {
    return UrlFetchApp.fetch(properties.getProperty("SLACK_WEBHOOK_URL"), {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ text: text || "", blocks: blocks || [] })
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
        formatEvent(res)
    ]);
}

function doListEvent () {
    var events = getEventList();
    postToSlack("", [
        {
            type: "section",
            text: { type: "mrkdwn", text: ":calendar: *UPCOMING EVENTS* :calendar:" },
        }
    ].concat(events.map(formatEvent)));
}

function doHelp () {
    postToSlack(
        "USAGE\n" +
        "- `/task hogehoge [yyyy/]mm/dd[-dd]` to add events\n" +
        "- `/task list` to see all events"
    );
}

function doAction (params) {
    var match = params.actions[0].value.match(/^([^:]+):(.*)$/);
    if (!match) throw "Parse error";

    var event = CalendarApp.getEventById(match[2]);

    if (match[1] == "delete") {
        postToSlack("", [
            {
                type: "section",
                text: { type: "mrkdwn", text: ":wastebasket: *EVENT DELETED:*" },
            },
            formatEvent(event)
        ]);
        event.deleteEvent();
    } else {
        throw "Unknown action";
    }
}

function doPost (e) {
    var params = e.parameter.payload ? JSON.parse(e.parameter.payload) : e.parameter;

    var verificationToken = params.token;
    if (verificationToken != properties.getProperty("SLACK_VERIFICATION_TOKEN")) throw "Invalid token";

    if (params.actions) {
        doAction(params);
    } else if (params.text == '') {
        doHelp();
    } else if (params.text == 'list') {
        doListEvent();
    } else {
        doAddEvent(params);
    }

    return ContentService.createTextOutput("");
}
