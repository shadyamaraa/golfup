const admin = require('firebase-admin');
const functions = require('firebase-functions/v1');

admin.initializeApp();

const APP_URL = 'https://ubgolf.club';

// Triggered when a new notification is written to /notifications/{userId}/{notifId}
exports.sendPushOnNotification = functions.database
  .ref('/notifications/{userId}/{notifId}')
  .onCreate(async (snap, context) => {
    const notif = snap.val();
    const { userId, notifId } = context.params;

    const userSnap = await admin.database().ref(`users/${userId}`).once('value');
    const user = userSnap.val();

    if (!user || user.notifyWeb === false || !user.fcmToken) return null;

    const line1 = notif.type === 'invite'
      ? `${notif.from} таныг тоглолтод урьлаа!`
      : notif.type === 'player_joined'
        ? `${notif.from} тоглолтод нэгдлээ!`
        : notif.type === 'player_left'
          ? `${notif.from} тоглолтоос гарлаа!`
          : notif.type === 'game_updated'
            ? `Тоглолт засагдлаа${notif.changes ? ': ' + notif.changes : ''}`
            : `${notif.from} шинэ тоглолт үүсгэлээ!`;
    const body = `${notif.gameDate} ${notif.gameTime} - ${notif.gameLocation}`;

    await admin.messaging().send({
      token: user.fcmToken,
      data: {
        title: `UB Golf: ${line1}`,
        body,
        gameId: notif.gameId || ''
      },
      webpush: {
        notification: {
          title: `UB Golf: ${line1}`,
          body,
          icon: `${APP_URL}/icon.svg`
        },
        fcm_options: {
          link: notif.gameId ? `${APP_URL}/#/game/${notif.gameId}` : APP_URL
        }
      }
    });

    console.log(`FCM push sent to user ${userId} for notif ${notifId}`);
    return null;
  });
