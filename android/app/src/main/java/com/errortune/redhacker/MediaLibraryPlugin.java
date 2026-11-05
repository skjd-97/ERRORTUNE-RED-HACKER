package com.errortune.redhacker;

import android.Manifest;
import android.content.ContentUris;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "MediaLibrary",
    permissions = {
        @Permission(
            alias = "media",
            strings = {
                Manifest.permission.READ_MEDIA_AUDIO,
                Manifest.permission.READ_MEDIA_VIDEO
            }
        ),
        @Permission(
            alias = "legacy",
            strings = { Manifest.permission.READ_EXTERNAL_STORAGE }
        )
    }
)
public class MediaLibraryPlugin extends Plugin {

    @PluginMethod
    public void requestAccess(PluginCall call) {
        String alias = Build.VERSION.SDK_INT >= 33 ? "media" : "legacy";
        if (getPermissionState(alias) == com.getcapacitor.PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
        } else {
            requestPermissionForAliases(new String[]{alias}, call, "permissionCallback");
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        String alias = Build.VERSION.SDK_INT >= 33 ? "media" : "legacy";
        JSObject result = new JSObject();
        result.put("granted",
            getPermissionState(alias) == com.getcapacitor.PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void listMedia(PluginCall call) {
        JSArray items = new JSArray();

        queryMedia(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
            "audio",
            items
        );

        queryMedia(
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
            "video",
            items
        );

        JSObject result = new JSObject();
        result.put("items", items);
        call.resolve(result);
    }


    @PluginMethod
    public void prepareMedia(PluginCall call) {
        String uriText = call.getString("uri");
        String name = call.getString("name", "media-file");

        if (uriText == null || uriText.isEmpty()) {
            call.reject("Media URI is missing.");
            return;
        }

        try {
            Uri source = Uri.parse(uriText);
            File directory = new File(getContext().getCacheDir(), "device-media");
            if (!directory.exists() && !directory.mkdirs()) {
                throw new Exception("Cannot create media cache.");
            }

            String safeName = name.replaceAll("[^a-zA-Z0-9._-]", "_");
            File destination = new File(directory,
                System.currentTimeMillis() + "_" + safeName);

            try (InputStream input = getContext().getContentResolver()
                    .openInputStream(source);
                 FileOutputStream output = new FileOutputStream(destination)) {
                if (input == null) throw new Exception("Cannot open media file.");
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    output.write(buffer, 0, count);
                }
            }

            JSObject result = new JSObject();
            result.put("path", destination.getAbsolutePath());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not prepare media: " + error.getMessage(), error);
        }
    }

    private void queryMedia(Uri collection, String kind, JSArray items) {
        String[] projection = {
            MediaStore.MediaColumns._ID,
            MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.MIME_TYPE,
            MediaStore.MediaColumns.SIZE,
            MediaStore.MediaColumns.DATE_ADDED,
            MediaStore.MediaColumns.RELATIVE_PATH
        };

        if ("video".equals(kind)) {
            projection = new String[]{
                MediaStore.MediaColumns._ID,
                MediaStore.MediaColumns.DISPLAY_NAME,
                MediaStore.MediaColumns.MIME_TYPE,
                MediaStore.MediaColumns.SIZE,
                MediaStore.MediaColumns.DATE_ADDED,
                MediaStore.MediaColumns.RELATIVE_PATH,
                MediaStore.Video.VideoColumns.DURATION
            };
        }

        try (Cursor cursor = getContext().getContentResolver().query(
            collection, projection, null, null,
            MediaStore.MediaColumns.DATE_ADDED + " DESC"
        )) {
            if (cursor == null) return;

            int idCol = cursor.getColumnIndex(MediaStore.MediaColumns._ID);
            int nameCol = cursor.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME);
            int mimeCol = cursor.getColumnIndex(MediaStore.MediaColumns.MIME_TYPE);
            int sizeCol = cursor.getColumnIndex(MediaStore.MediaColumns.SIZE);
            int dateCol = cursor.getColumnIndex(MediaStore.MediaColumns.DATE_ADDED);
            int pathCol = cursor.getColumnIndex(MediaStore.MediaColumns.RELATIVE_PATH);
            int durationCol = cursor.getColumnIndex(MediaStore.Video.VideoColumns.DURATION);

            while (cursor.moveToNext()) {
                long id = cursor.getLong(idCol);
                Uri contentUri = ContentUris.withAppendedId(collection, id);

                JSObject item = new JSObject();
                item.put("id", kind + ":" + id);
                item.put("uri", contentUri.toString());
                item.put("name", nameCol >= 0 ? cursor.getString(nameCol) : "Unknown");
                item.put("mimeType", mimeCol >= 0 ? cursor.getString(mimeCol) : "");
                item.put("size", sizeCol >= 0 ? cursor.getLong(sizeCol) : 0);
                item.put("dateAdded", dateCol >= 0 ? cursor.getLong(dateCol) : 0);
                item.put("path", pathCol >= 0 ? cursor.getString(pathCol) : "");
                item.put("kind", kind);
                item.put("duration",
                    "video".equals(kind) && durationCol >= 0
                        ? cursor.getLong(durationCol) : 0
                );
                items.put(item);
            }
        } catch (Exception ignored) {
            // Keep other media results if one collection cannot be queried.
        }
    }
}
