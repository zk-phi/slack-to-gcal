/* event -> str */
function formatEvent (event, deleted, withActions) {
    var from = event.getStartTime();
    var to = event.getEndTime();
    to.setDate(to.getDate() - 1);

    var decoration = deleted ? "~" : "";

    var text = decoration + event.getTitle() + " (" + from.toLocaleDateString() + (
        from < to ? " - " + to.toLocaleDateString() : ""
    ) + ")" + decoration;

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
