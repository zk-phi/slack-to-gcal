var _properties = PropertiesService.getScriptProperties();

var SLACK_VERIFICATION_TOKEN = _properties.getProperty("SLACK_VERIFICATION_TOKEN");
var SLACK_WEBHOOK_URL        = _properties.getProperty("SLACK_WEBHOOK_URL");
var SLACK_ACCESS_TOKEN       = _properties.getProperty("SLACK_ACCESS_TOKEN");
var END_OF_DATE_TIME         = _properties.getProperty("END_OF_DATE_TIME") || 0;
var TASK_LIST_NAME           = "TODOs";
