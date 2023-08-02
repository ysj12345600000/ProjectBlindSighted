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

export interface DeciceInfo{
    device : Device;
    index : number;
    // 服务信息
    notifyCharacteristicUUID: string;
    serviceId: string;
    writeCharacteristicUUID: string;

    // 回复信息
    responeseContext : string;

    // 计算距离参数
    distanceCalculateParams : DsitanceCalculateParams | null;

}
export interface RssiInfo{
    index : number;
    rssiList : number[];
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
    let MAX_RSSI_LENGTH = 50;
    const RETRY_DELAY = 100;
    const MAX_RETRIES = 25;

    const [isBleOpen, setIsBleOpen] = useState(false);
    const [isSearchBle, setIsSearchBle] = useState(false);
    const [deviceList, setDeviceList] = useState<Device[]>([]);
    const [targetMacIds, setTargetMacIds] = useState<string[]>([]);
    const [isTogglingBle, setIsTogglingBle] = useState(false);
    const [isAllowRssiScan, setIsAllowRssiScan] = useState(false);
    const [currentCommunicatrMacId, setCurrentCommunicatrMacId] = useState<string|null>(null);
    const [errorTimes, setErrorTimes] = useState(0);

    const [distanceCalculateParamsList, setDistanceCalculateParamsList] = useState<DsitanceCalculateParams[]>([]);
    const [connectedDevicesInfo, setConnectedDevicesInfo] = useState<DeciceInfo[]>([]);
    const [rssiLists, setRssiLists] = useState<RssiInfo[]>([]);

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

        setConnectedDevicesInfo(()=>{
            let connectedDeviceInfo : DeciceInfo[] = [];
            for(let k=0;k<3;k++){
                const deviceInfo = {
                    device : {} as Device,
                    index : k+1,
                    notifyCharacteristicUUID: '',
                    serviceId: '',
                    writeCharacteristicUUID: '',
                    responeseContext : '',
                    distanceCalculateParams : null,
                }
                connectedDeviceInfo.push(deviceInfo);
            }
            return connectedDeviceInfo;
        });

        setRssiLists(()=>{
            let rssiLists_ : RssiInfo[] = [];
            for(let k=0;k<3;k++){
                const rssiInfo = {
                    index : k+1,
                    rssiList : [],
                }
                rssiLists_.push(rssiInfo);
            }
            return rssiLists_;
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
        if(connectedDevicesInfo.length == 3) return;
        console.log('开始搜索蓝牙');
        setIsSearchBle(true);
    };
    
    const stopSearchBle = () => {
        console.log('停止搜索蓝牙');
        setIsSearchBle(false);
    };

    // 连接蓝牙

    const connectBle = async (macId:string) => {
        stopSearchBle();// 停止搜索蓝牙

        if(connectedDevicesInfo.some((device => device.device.id === macId))){
            console.log('该设备已连接', deviceList.filter(device => targetMacIds.includes(device.id)));
            startSearchBle();  // 开始搜索蓝牙
            return;
        }

        try{
            const device = await manager.connectToDevice(macId, { autoConnect: true, requestMTU: 512 });
            const parts = device.name!.split('_');
            const numberPart = parseInt(parts[parts.length - 1]);

            onDisconnect(macId); // 监听断开连接

            setConnectedDevicesInfo(prevDevices => {
                if(prevDevices.some((device => device.device.id === macId))){
                    return prevDevices;
                }
                
                const updateInfo = prevDevices.map(deviceInfo=>{
                    if(deviceInfo.index == numberPart){
                        deviceInfo.device = device;
                    }
                    return deviceInfo;
                })
                return updateInfo;
            });

            await manager.discoverAllServicesAndCharacteristicsForDevice(macId);

            if( numberPart=== 1){
                await getServiceID(macId);
                setCurrentCommunicatrMacId(macId);
            }
        } catch (error) {
            console.log('连接失败', error);
            startSearchBle();  // 开始搜索蓝牙
        } finally {
            startSearchBle();  // 开始搜索蓝牙
        }
    };

    //监听连接情况
    const onDisconnect = (macId: string) => {
        const subscription = manager.onDeviceDisconnected(macId, (error, device) => {
            if (error) {
                console.log('设备断开监听失败', error);
            } else {
                console.log('设备断开监听成功', device);
                // 从已连接设备列表中移除
                setConnectedDevicesInfo(prevDevices => prevDevices.filter(device => device.device.id !== macId));
            }
        });
        return () => {
            subscription.remove();
        };
    };

        //设备通讯
    const getDeviceInfo=  (macId: string): DeciceInfo => {
        return connectedDevicesInfo.find(device => device.device.id === macId)!;
    };

    const getServiceID = async (macId: string) => {
        try{
            const services = await manager.servicesForDevice(macId);
            console.log('获取服务成功', macId, services);
            let serviceUUID = services[2].uuid;
            await getCharacterIdNotify(serviceUUID, macId);
        } catch(error){
            console.error('获取服务失败', error);
        }
    };

    const getCharacterIdNotify = async (serviceUUID : string, macId : string) => {
        try{
            const device = await manager.isDeviceConnected(macId);
            if(!device){
                console.log('设备未连接');
                return null;
            }
            const characteristics = await manager.characteristicsForDevice(macId, serviceUUID);
            console.log('获取特征值成功', macId, characteristics);
            if (characteristics.length < 2) {
                console.error("Expected at least 2 characteristics, but got less.");
                return null;
            }
            
            setConnectedDevicesInfo(prevDevices => prevDevices.map(deviceInfo=>{
                if(deviceInfo.device.id === macId){
                    return {
                        ...deviceInfo,
                        notifyCharacteristicUUID : characteristics[0].uuid,
                        writeCharacteristicUUID : characteristics[1].uuid,
                        serviceId : characteristics[1].serviceUUID,
                    };
                }
                return deviceInfo;
            }));
        } catch(error){
            console.error('获取特征值失败', error);
        }
    };

    const startNoticeBle = async(deviceInfo: DeciceInfo) => {

        const decodeFormatMessage2DsitanceCalculateParams = (macId: string, message: string) => {

            let deviceInfo = message.split(':');
            let deviceInfoList = deviceInfo[1].split(',');

            const distanceCalculateParams : DsitanceCalculateParams = {
                


    };
  
    const value = {
        
    };
    return <BleManagerContext.Provider value={value}>{children}</BleManagerContext.Provider>;
}
export default useBleManager;