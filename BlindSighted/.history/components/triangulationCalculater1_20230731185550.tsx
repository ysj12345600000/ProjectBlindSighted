import React, { useState} from 'react';
import {Alert, NativeModules} from 'react-native';
import * as numeric from 'numeric';
import { ConnectedDeciceInfo, RssiInfo } from '../components/BleOperation1';

export interface DsitanceCalculateParams {

    // x: Initial estimate
    // A  State transition matrix
    // H Measurement matrix
    // Q Process noise covariance
    // R Measurement noise covariance
    // P Initial estimate error covariance

    // N Path loss exponent
    macId : string;
    deviceName : string;
    rssiRef: number;
    x : number;
    A : number;
    H : number;
    N : number;
    P : number;
    Q : number;
    R : number;
    distance : number;
    position : [x : number, y : number, z : number];
    angle : number;
};


export const triangulationCalculater = () => {
    const [ estimatedDistance, setEstimatedDistance ] = useState<number | null>(null); //估计距离

    const calculateDistance = async (distanceCalculateParamsList : DsitanceCalculateParams[], rssiList: RssiInfo) => {}{}



    

   
    
    function dot(u: number[], v: number[]): number {
        let sum = 0;
        for (let i = 0; i < u.length; i++) {
            sum += u[i] * v[i];
        }
        return sum;
    }
    
    function norm(v: number[]): number {
        return Math.sqrt(dot(v, v));
    }
    
    function subtract(v1: number[], v2: number[]): number[] {
        const diff: number[] = [];
        for (let i = 0; i < v1.length; i++) {
            diff.push(v1[i] - v2[i]);
        }
        return diff;
    }
    
    function add(v1: number[], v2: number[]): number[] {
        const sum: number[] = [];
        for (let i = 0; i < v1.length; i++) {
            sum.push(v1[i] + v2[i]);
        }
        return sum;
    }
    
    function scale(v: number[], factor: number): number[] {
        return v.map(n => n * factor);
    }
    
    function normalize(v: number[]): number[] {
        const magnitude = norm(v);
        return scale(v, 1 / magnitude);
    }
    
    function cross(u: number[], v: number[]): number[] {
        return [
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0]
        ];
    }

     // 计算两个向量的叉积
     function crossProduct(u: Vector2D, v: Vector2D): number {
        return u.x * v.y - u.y * v.x;
    }
    
    // 计算向量的模长
    function magnitude(v: Vector2D): number {
        return Math.sqrt(v.x * v.x + v.y * v.y);
    }

    function cartesianToPolar(x: number, y: number) {
        //获取极坐标下的角度
        const r = Math.sqrt(x * x + y * y);
        const theta = Math.atan2(y, x);
        return theta * (180 / Math.PI);
    }

    type Vector2D = {
        x: number;
        y: number;
    };
    
    return{
        calculateDistance,
        getUsersPosition,
        calculateDistances,
        angleDifference,
        
    }

};

export default triangulationCalculater;