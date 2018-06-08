const dgram = require('dgram');

const {Commands, States} = require('./constants');
const {createHeader, checkValid} = require('./utils');

/**
 *
 * @extends ZKLib
 */
class ZkUser {
  getSizeUser() {
    const command = this.data_recv.readUInt16LE(0);

    if (command == Commands.PREPARE_DATA) {
      const size = this.data_recv.readUInt32LE(8);
      return size;
    } else {
      return 0;
    }
  }

  /**
   *
   * @param {Buffer} userdata
   */
  decodeUserData(userdata) {
    const user = {
      uid: userdata.readUInt16BE(0),
      role: userdata.readUInt16BE(2),
      password: userdata
        .slice(4, 12)
        .toString('ascii')
        .split('\0')
        .shift(),
      name: userdata
        .slice(12, 36)
        .toString('ascii')
        .split('\0')
        .shift(),
      cardno: userdata.readUInt32LE(36),
      userid: userdata
        .slice(49, 72)
        .toString('ascii')
        .split('\0')
        .shift(),
    };

    return user;
  }

  /**
   *
   * @param {number} uid
   * @param {(err: Error) => void} cb
   */
  delUser(uid, cb) {
    const command_string = Buffer.alloc(2);

    command_string.writeUInt16LE(uid, 0);

    this.executeCmd(Commands.DELETE_USER, command_string, cb);
  }

  /**
   *
   * @param {number} uid
   * @param {string} password
   * @param {string} name
   * @param {number} user_id
   * @param {(err: Error) => void} cb
   */
  setUser(uid, password = '', name = '', user_id, cb) {
    const command_string = Buffer.alloc(72);

    command_string.writeUInt16LE(uid, 0);
    command_string[2] = 0;
    command_string.write(password, 3, 11);
    command_string.write(name, 11, 39);
    command_string[39] = 1;
    command_string.writeUInt32LE(0, 40);
    command_string.write(user_id ? user_id.toString(10) : '', 48);

    this.executeCmd(Commands.USER_WRQ, command_string, cb);
  }

  /**
   *
   * @param {number} uid
   * @param {(err: Error) => void} cb
   */
  enrollUser(uid, cb) {
    const command = Commands.START_ENROLL;
    const command_string = new Buffer(2);

    command_string.write(uid.toString());

    this.executeCmd(Commands.START_ENROLL, command_string, cb);
  }

  /**
   *
   * @param {(err: Error, users: object[]) => void} cb
   */
  getUser(cb) {
    const command_string = Buffer.from([0x05]);

    const session_id = this.session_id;
    const reply_id = this.data_recv.readUInt16LE(6);

    const buf = createHeader(Commands.USERTEMP_RRQ, session_id, reply_id, command_string);

    // this.createSocket();

    let state = States.FIRST_PACKET;
    let total_bytes = 0;
    let bytes_recv = 0;
    let rem = Buffer.from([]);
    let offset = 0;

    const userdata_size = 72;
    const trim_first = 11;
    const trim_others = 8;
    const users = [];

    const internalCallback = (err, data) => {
      this.socket.removeListener(this.DATA_EVENT, handleOnData);

      cb(err, data);
    };

    const handleOnData = (reply, remote) => {
      switch (state) {
        case States.FIRST_PACKET:
          state = States.PACKET;

          this.data_recv = reply;

          if (reply && reply.length) {
            this.session_id = reply.readUInt16LE(4);

            total_bytes = this.getSizeUser();

            if (total_bytes <= 0) {
              // this.closeSocket();

              return internalCallback(new Error('no data'));
            }
          } else {
            internalCallback(new Error('zero length reply'));
          }

          break;

        case States.PACKET:
          if (bytes_recv == 0) {
            offset = trim_first;
            bytes_recv = 4;
          } else {
            offset = trim_others;
          }

          while (reply.length + rem.length - offset >= userdata_size) {
            const userdata = new Buffer(userdata_size);

            if (rem.length > 0) {
              rem.copy(userdata);
              reply.copy(userdata, rem.length, offset);
              offset += userdata_size - rem.length;
              rem = Buffer.from([]);
            } else {
              reply.copy(userdata, 0, offset);
              offset += userdata_size;
            }

            const user = this.decodeUserData(userdata);
            users.push(user);

            bytes_recv += userdata_size;

            if (bytes_recv == total_bytes) {
              state = States.FINISHED;
            }
          }

          rem = new Buffer(reply.length - offset);
          reply.copy(rem, 0, offset);

          break;

        case States.FINISHED:
          // this.closeSocket();

          internalCallback(null, users);

          break;
      }
    };

    this.socket.on(this.DATA_EVENT, handleOnData);

    this.send(buf, 0, buf.length, err => {
      if (err) {
        internalCallback && internalCallback(err);
      }
    });
  }

  /**
   * @deprecated since version 0.2.0. Use getUser instead
   */
  getuser(cb) {
    console.warn('getuser() function will deprecated soon, please use getUser()');
    return this.getUser(cb);
  }

  /**
   * @deprecated since version 0.2.0. Use enrollUser instead
   */
  enrolluser(id, cb) {
    console.warn('enrolluser() function will deprecated soon, please use enrollUser()');
    return this.enrollUser(id, cb);
  }

  /**
   * @deprecated since version 0.2.0. Use setUser instead
   */
  setuser(uid, password = '', name = '', user_id, cb) {
    console.warn('setuser() function will deprecated soon, please use setUser()');
    return this.setUser(uid, password, name, user_id, cb);
  }

  /**
   * @deprecated since version 0.2.0. Use delUser instead
   */
  deluser(id, cb) {
    console.warn('deluser() function will deprecated soon, please use delUser()');
    return this.delUser(id, cb);
  }
}

module.exports = ZkUser;
