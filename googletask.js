/* task -> slack block */
function formatTask (task, deleted, withActions) {
    var decoration = deleted ? "~" : "";
    var block = {
        type: "section",
        text: { type: "mrkdwn", text: decoration + task.title + decoration }
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

/* str -> tasklist */
function _createTaskList (title) {
    var list = Tasks.newTaskList();
    list.title = title;
    return Tasks.Tasklists.insert(list);
}

/* () -> tasklistId */
function _getTaskListIdCreate () {
    var taskLists = Tasks.Tasklists.list().getItems();
    for (var i = 0; i < taskLists.length; i++) {
        if (taskLists[i].title == TASK_LIST_NAME) {
            return taskLists[i].id;
        }
    }
    return _createTaskList(TASK_LIST_NAME).id;
}

/* () -> [task] */
function getTasks () {
    return Tasks.Tasks.list(_getTaskListIdCreate()).items || [];
}

/* taskId -> task */
function getTask (id) {
    return Tasks.Tasks.get(_getTaskListIdCreate(), id);
}

/* taskId -> task */
function deleteTask (id) {
    return Tasks.Tasks.remove(_getTaskListIdCreate(), id);
}

/* str -> task */
function createTask (title) {
    var task = Tasks.newTask();
    task.title = title;
    return Tasks.Tasks.insert(task, _getTaskListIdCreate());
}

/* (str, taskId) -> task */
function updateTask (task, id) {
    return Tasks.Tasks.patch(task, _getTaskListIdCreate(), id);
}
