package com.newapp;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Callback;
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

public class CompassModule extends ReactContextBaseJavaModule implements SensorEventListener {

    private SensorManager sensorManager;
    private Callback mCallback;

    private final float ALPHA = 0.25f; // if ALPHA = 1 OR 0, no filter applies.

    public CompassModule(ReactApplicationContext reactContext) {
        super(reactContext);
        sensorManager = (SensorManager) reactContext.getSystemService(Context.SENSOR_SERVICE);
    }

    @Override
    public String getName() {
        return "CompassModule";
    }

    @ReactMethod
    public void getDirection(Callback callback) {
        this.mCallback = callback;

        Sensor magneticSensor = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        Sensor accelerometerSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);

        sensorManager.registerListener(this, magneticSensor, SensorManager.SENSOR_DELAY_GAME);
        sensorManager.registerListener(this, accelerometerSensor, SensorManager.SENSOR_DELAY_GAME);
    }

    float[] accelerometerValues = new float[3];
    float[] magneticValues = new float[3];

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
            accelerometerValues = lowPass(event.values.clone(), accelerometerValues);
        } else if (event.sensor.getType() == Sensor.TYPE_MAGNETIC_FIELD) {
            magneticValues = lowPass(event.values.clone(), magneticValues);
        }
        float[] R = new float[9];
        float[] values = new float[3];
        SensorManager.getRotationMatrix(R, null, accelerometerValues, magneticValues);
        sensorManager.getOrientation(R, values);
        float rotateDegree = -(float) Math.toDegrees(values[0]);

        if (mCallback != null) {
            mCallback.invoke(rotateDegree);
            mCallback = null;
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    /**
     * Low-pass filter to reduce noise.
     */
    protected float[] lowPass(float[] input, float[] output) {
        if (output == null) return input;
        for (int i = 0; i < input.length; i++) {
            output[i] = output[i] + ALPHA * (input[i] - output[i]);
        }
        return output;
    }
}
