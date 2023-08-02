import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback} from 'react';
import {Alert} from 'react-native';
import { Buffer } from 'buffer';
import {PermissionsAndroid, Platform} from 'react-native';
import {BleError,BleManager,Characteristic,Device, Service} from 'react-native-ble-plx';
import {PERMISSIONS, requestMultiple} from 'react-native-permissions';
import DeviceInfo from 'react-native-device-info';
import {DsitanceCalculateParams} from './triangulationCalculater';


type VoidCallback = (result: boolean) => void;
const manager = new BleManager();

interface ConnectedDeciceInfo{
    device : Device;
    index : number;
    rssiList : number[];
    // 服务信息
    notifyCharacteristicUUID: string;
    serviceId: string;
    writeCharacteristicUUID: string;

    // 回复信息
    responeseContext : string;

    // 计算距离参数
    distanceCalculateParams : DsitanceCalculateParams | null;

}


interface BleManagerContextProps {

    
  }
  
const BleManagerContext = createContext<BleManagerContextProps|null>({} as BleManagerContextProps);
  
export const useBleManager = () =>{
    const context = useContext(BleManagerContext);
    if (!context) {
      throw new Error('useBleManager must be used within a BleManagerContextProvider');
    }
    return context;
  }
  
interface BleManagerContextProviderProps {children: ReactNode;}

export const BleManagerContextProvider = ({ children }: BleManagerContextProviderProps) => {
    let MAXATTEMPTTIMES = 3;
    let RETRY_DELAY = 500;

    const [isBleOpen, setIsBleOpen] = useState(false);
    const [isSearchBle, setIsSearchBle] = useState(false);
    const [deviceList, setDeviceList] = useState<Device[]>([]);
    const [targetMacIds, setTargetMacIds] = useState<string[]>([]);
    const [connectedDevicesInfo, setConnectedDevicesInfo] = useState<ConnectedDeciceInfo[]>([]);
    const [isTogglingBle, setIsTogglingBle] = useState(false);
    const [isAllowRssiScan, setIsAllowRssiScan] = useState(false);

    let distanceCalculateParamsList : DsitanceCalculateParams[] = [];

    // 初始化及获取权限
    useEffect(() => {
        const subscription = manager.onStateChange((state) => {
          if (state === 'PoweredOff') {
            setDeviceList([]);
            setConnectedDevicesInfo([]);         
            setIsBleOpen(false);
            Alert.alert('蓝牙已关闭, 请打开蓝牙设备');
          }
    
          if (state === 'PoweredOn') {
            setIsBleOpen(true);
          }
        }, true);

        setTargetMacIds(['34:85:18:6E:5B:19','34:85:18:42:4E:39','34:85:18:6E:D4:C5'])
        requestPermissions((granted: boolean) => {
          if (!granted) {
            Alert.alert('Permission Required', 'This app needs bluetooth permissions to function properly');
          }
        });
    
        return () => {
          subscription.remove();
        };
    }, [isBleOpen]);

    const requestPermissions = useCallback( async (cb: VoidCallback) => {
        if (Platform.OS === 'android') {
            const apiLevel = await DeviceInfo.getApiLevel();

            if (apiLevel < 31) {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                {
                title: 'Location Permission',
                message: 'Bluetooth Low Energy requires Location',
                buttonNeutral: 'Ask Later',
                buttonNegative: 'Cancel',
                buttonPositive: 'OK',
                },
            );
            cb(granted === PermissionsAndroid.RESULTS.GRANTED);
            } else {
            const result = await requestMultiple([
                PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
                PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
                PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
            ]);

            const isGranted =
                result['android.permission.BLUETOOTH_CONNECT'] ===
                PermissionsAndroid.RESULTS.GRANTED &&
                result['android.permission.BLUETOOTH_SCAN'] ===
                PermissionsAndroid.RESULTS.GRANTED &&
                result['android.permission.ACCESS_FINE_LOCATION'] ===
                PermissionsAndroid.RESULTS.GRANTED;

            cb(isGranted);
            }
        } else {
            cb(true);
        }
    }, []);
    
    // 搜索蓝牙
    const isDuplicteDevice = (devices: Device[], nextDevice: Device) =>
    devices.findIndex(device => nextDevice.id === device.id) > -1;

    useEffect(() => {
        if (isTogglingBle) return;
    
        if (isSearchBle) {
            setDeviceList([]);
    
            // 开始扫描
            manager.startDeviceScan(null, null, (error, device) => {
                if (error) {
                    console.error(error);
                    return;
                }
    
                if (device && device.name) {
                    setDeviceList((prevState: Device[]) => {
                        if (!isDuplicteDevice(prevState, device)) {
                            const newState = [...prevState, device];
                            console.log('扫描到设备', device, deviceList);
                            return newState;
                        }
                        return prevState;
                    });
                }
            });
        } else {
            manager.stopDeviceScan();
        }
    }, [isSearchBle]);

    const startSearchBle = () => {
        console.log('开始搜索蓝牙');
        setIsSearchBle(true);
    };

    const stopSearchBle = () => {
        console.log('停止搜索蓝牙');
        setIsSearchBle(false);
    };
    
    // 连接蓝牙
    const connectBle = async (macId:string) => {
        stopSearchBle();

        if(connectedDevicesInfo.some((device => device.device.id === macId))){
            console.log('该设备已连接', deviceList.filter(device => targetMacIds.includes(device.id)));
            startSearchBle;  // 开始搜索蓝牙
            return;
        }

        try{
            const device = await manager.connectToDevice(macId);

            setConnectedDevicesInfo(preDevices => {
                if(preDevices.some(d => d.device.id === macId)){
                    console.log('该设备已连接', device.name);
                    return preDevices;
                }
                if(preDevices.length === 3){
                    console.log('设备数量已达上限');
                    return preDevices;
                }
                const parts = device.name!.split('_');
                const numberPart = parseInt(parts[parts.length - 1]);
                let currentConnectedDeviceInfo = {
                    device : device,
                    index : numberPart,
                    rssiList : [],
                    notifyCharacteristicUUID: '',
                    serviceId: '',
                    writeCharacteristicUUID: '',
                    responeseContext : '',
                    distanceCalculateParams : null,
                };

                return [...preDevices, currentConnectedDeviceInfo];
            })
            onDisconnect(device.id);
            console.log('连接成功', device.name);
    
            await manager.discoverAllServicesAndCharacteristicsForDevice(macId);
            const parts = device.name!.split('_');
            const numberPart = parseInt(parts[parts.length - 1]);
            if( numberPart=== 1){
                (async () => {
                    await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
                    await getServiceID(macId);
                    await startNoticeBle(macId);
                    await bleWirte(macId, 'GETDEVICEINFO');
                })();
            }

        } catch(error) {
            console.log('连接失败', error);
        } finally {
            if(connectedDevicesInfo.length < 3){
                startSearchBle;  // 开始搜索蓝牙
            }
        }

    };

    // 断开蓝牙
    const disconnectBle = async (macId:string) => {
        if(connectedDevicesInfo.some((device => device.device.id === macId))){
            manager.cancelDeviceConnection(macId).then((res) => {
                console.log('断开连接成功', res);
                // 从已连接设备列表中移除
                setConnectedDevicesInfo(prevDevices => prevDevices.filter(device => device.id !== macId));
              }).catch((err) => {
                console.error('断开连接失败', err);
            });
        }else{
            console.log('该设备未连接', macId);
        }
    };

    // 监听连接状态
    const onDisconnect = (macId:string) => {
        const subscription = manager.onDeviceDisconnected(macId, (error, device) => {
            if (error) {
                console.error('监听连接状态失败', error);
            }else{
                console.log('监听连接状态成功:蓝牙已断开', device);
                // 从已连接设备列表中移除
                setConnectedDevicesInfo(prevDevices => prevDevices.filter(device => device.device.id !== macId));
            }
        });
        return ()=>{
            subscription.remove();
        }
    };

    //设备通讯
    const getDeviceInfo=  (macId: string): ConnectedDeciceInfo => {
        return connectedDevicesInfo.find(device => device.device.id === macId)!;
    };

    const getServiceID = async (macId: string) => {
        try{
            const services = await manager.servicesForDevice(macId);
            console.log('获取服务成功', macId, services);
            let serviceUUID = services[2].uuid;
            return await getCharacterIdNotify(serviceUUID, macId);
        } catch(error){
            console.error('获取服务失败', error);
        }
    };

    const getCharacterIdNotify = async (serviceUUID : string, macId : string) => {
        try{
            const device = await manager.is
        }
    }



    

    





    const value = {
       
        

    };
    return <BleManagerContext.Provider value={value}>{children}</BleManagerContext.Provider>;
}
export default useBleManager;