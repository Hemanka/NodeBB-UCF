import _ = require('lodash');

import meta = require('../meta');
import db = require('../database');
import plugins = require('../plugins');
import user = require('../user');
import topics = require('../topics');
import categories = require('../categories');
import groups = require('../groups');
import utils = require('../utils');


// type Posts = {
//     // create: (data: Record<string, string[] | string | number | symbol>) => Promise<PostData>;
//     create: (data: Data) => Promise<PostData>;
//     uploads: (pid: number) => Promise<void>;
//     // addReplyTo: (postData: PostData[], timestamp: number) => Promise<{}>;
// }

interface Data {
    pid?: number;
    tid?: number;
    content?: string;
    uid?: string;
    timestamp?: number;
    isMain?: boolean;
    toPid?: number;
    ip?: string;
    handle?: string;
    cid?: number;
}

interface PostData {
    pid: number;
    tid: number;
    content: string;
    uid: string;
    timestamp: number;
    isMain?: boolean;
    toPid?: number;
    ip?: string;
    handle?: string;
    cid?: number;
}
interface Result {
    post: PostData;
}

interface Topics {
    cid?: number;
    pinned?: boolean | undefined;
}

// module.exports = function (Posts: Posts) {
module.exports = function (Posts) {
    async function addReplyTo(postData: PostData, timestamp: number) {
        if (!postData.toPid) {
            return;
        }
        await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            db.sortedSetAdd(`pid:${postData.toPid}:replies`, timestamp, postData.pid),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            db.incrObjectField(`post:${postData.toPid}`, 'replies'),
        ]);
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    Posts.create = async function (data: Data) {
        // This is an internal method, consider using Topics.reply instead
        const { uid } = data;
        const { tid } = data;
        const content = data.content.toString();
        const timestamp = data.timestamp || Date.now();
        const isMain = data.isMain || false;
        // const { toPid } = data;
        // const { ip } = data;
        // const { handle } = data;
        // const { cid } = data;

        if (!uid && parseInt(uid, 10) !== 0) {
            throw new Error('[[error:invalid-uid]]');
        }

        if (data.toPid && !utils.isNumber(data.toPid)) {
            throw new Error('[[error:invalid-pid]]');
        }

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const pid = await db.incrObjectField('global', 'nextPid') as number;
        let postData: PostData = {
            pid: pid,
            uid: uid,
            tid: tid,
            content: content,
            timestamp: timestamp,
        };

        // console.log(data.toPid);


        if (data.toPid) {
            postData.toPid = data.toPid;
        }
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        if (data.ip && meta.config.trackIpPerPost) {
            postData.ip = data.ip;
        }
        if (data.handle && !parseInt(uid, 10)) {
            postData.handle = data.handle;
        }

        let result: Result = await plugins.hooks.fire('filter:post.create', { post: postData, data: data }) as Result;
        postData = result.post;
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.setObject(`post:${postData.pid}`, postData);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const topicData: Topics = await topics.getTopicFields(tid, ['cid', 'pinned']) as Topics;
        postData.cid = topicData.cid;

        await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            db.sortedSetAdd('posts:pid', timestamp, postData.pid),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            db.incrObjectField('global', 'postCount'),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            user.onNewPostMade(postData),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            topics.onNewPostMade(postData),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            categories.onNewPostMade(topicData.cid, topicData.pinned, postData),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            groups.onNewPostMade(postData),
            addReplyTo(postData, timestamp),
            // Posts.uploads.sync(postData.pid),
            // await Posts.uploads(postData.pid),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            Posts.uploads.sync(postData.pid),
        ]);

        result = await plugins.hooks.fire('filter:post.get', { post: postData, uid: data.uid }) as Result;
        result.post.isMain = isMain;
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await plugins.hooks.fire('action:post.save', { post: _.clone(result.post) });
        return result.post;
    };
};