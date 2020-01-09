const Promise = require("bluebird");
const logger = require('../logger')('topics-consumer');
const {KafkaConsumer} = require('node-rdkafka');

module.exports = function (host = 'kafka', group = 'kafka-ui-topic-fetch', keepalive = false, smallestOffset = false, persistOffset = false,
                           ignoreTopics = ['__consumer_offsets']) {
    const self = this;

    self.connect = (toResolve, onFatal) => {
        let consumer = new KafkaConsumer({
            'group.id': group,
            'metadata.broker.list': host,
            'socket.keepalive.enable': keepalive,
            'enable.auto.offset.store': persistOffset,
            'enable.auto.commit': persistOffset,
            'auto.offset.reset': smallestOffset ? 'smallest' : 'end',
        });

        consumer.on('ready', () => {
            logger.debug("connected");
            return Promise.resolve(toResolve(consumer));
        }).on('connection.failure', (err) => {
            onFatal(err);
        }).on('error', (err) => {
            onFatal(err);
        }).on('event.error', (err) => {
            onFatal(err);
        });

        consumer.connect();
    };

    self.fetchTopics = (cb) => {
        return self.connect((consumer) => consumer.getMetadata({}, (err, metadata) => {
            if (!!err) {
                logger.error(err);
                cb(Promise.reject(err));
                return;
            }

            consumer.disconnect();
            logger.debug("topics fetched. disconnecting...");
            cb(Promise.resolve(metadata.topics.map(t => t.name).filter(t => ignoreTopics.indexOf(t) === -1)));
        }), (err) => {
            logger.fatal(err);
            process.exit(1);
        })
    };


    self.topicsFetchLoop = (cb) => {
        return Promise.delay(1000).then(() => {
            return self.fetchTopics((result) => {
                return result.catch(err => {
                    logger.fatal(err);
                    process.exit(1);
                }).then(topics => {
                    cb(topics);
                    topicsFetchLoop(cb);
                });
            });
        });
    };

    return self.topicsFetchLoop;
};