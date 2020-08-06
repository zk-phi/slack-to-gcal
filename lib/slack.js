/* (str, [slack block]) -> api response */
function postToSlack (content) {
    return UrlFetchApp.fetch(SLACK_WEBHOOK_URL, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
            text: typeof content == "string" ? content : "",
            blocks: typeof content == "object" ? content : []
        })
    });
}

function responseToSlack (content, type) {
    return ContentService.createTextOutput(JSON.stringify({
        response_type: type || "ephemeral",
        text: typeof content == "string" ? content : "",
        blocks: typeof content == "object" ? content : []
    })).setMimeType(ContentService.MimeType.JSON);
}

/* (triggerId, [slack block], bool) -> api response */
function openSlackModal (trigger_id, view, push) {
    return UrlFetchApp.fetch('https://slack.com/api/views.' + (push ? 'push' : 'open'), {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + SLACK_ACCESS_TOKEN },
        payload: JSON.stringify({ trigger_id: trigger_id, view: view })
    });
}
