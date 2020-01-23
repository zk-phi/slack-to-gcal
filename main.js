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

    return "'" + event.getTitle() + "'" + (
        from < to ? (
            " from " + from.toLocaleDateString() + " to " + to.toLocaleDateString()
        ) : (
            " at " + from.toLocaleDateString()
        )
    );
}

/* --- slack utils */

function postToSlack (text) {
    return UrlFetchApp.fetch(properties.getProperty("SLACK_WEBHOOK_URL"), {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ text: text })
    });
}

/* --- interface */

function doAddEvent (e) {
    var res = addEventByStr(e.parameter.text);
    postToSlack("ADDED EVENT: '" + formatEvent(res));
}

function doListEvent (e) {
    var events = getEventList();
    postToSlack("UPCOMING EVENTS: \n" + events.map(formatEvent).join("\n"));
}

function doHelp (e) {
    postToSlack(
        "- `/task hogehoge [yyyy/]mm/dd[-dd]` to add events\n" +
        "- `/task list` to see all events"
    );
}

function doPost (e) {
    var verificationToken = e.parameter.token;
    if (verificationToken != properties.getProperty("SLACK_VERIFICATION_TOKEN")) throw "Invalid token";

    if (e.parameter.text == '') {
        doHelp(e);
    } else if (e.parameter.text == 'list') {
        doListEvent(e);
    } else {
        doAddEvent(e);
    }

    return ContentService.createTextOutput("");
}
